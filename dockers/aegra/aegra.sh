#!/usr/bin/env bash
# ============================================================================
# Aegra 一键部署（自托管 LangGraph Platform 替代品 · 单机/单实例）
#
# 单脚本自包含：自动检测并安装前置依赖 → 拉取源码 → 生成全部配置
#   （.env 随机密钥 + docker-compose.yml）→ 编译并拉起全栈。
#
# 架构（对应「Agent 完整架构」图）：
#   客户端 ──HTTP/SSE(Agent Protocol)──▶ Aegra Web·FastAPI（控制平面，端口 2026）
#                                         │  认证/Assistants/Threads/Runs/SSE
#                                         ▼
#   WorkerExecutor（Redis 队列 + 异步执行 + 租约崩溃恢复，REDIS_BROKER_ENABLED=true）
#                                         │  运行 LangGraph runtime（main / analysis graph）
#                                         ▼
#   LLM 调用 ──▶ 远程 LiteLLM 网关 mspbots aigateway（统一入口，OpenAI 兼容，无需本地部署）
#   数据与存储层：PostgreSQL + pgvector + LangGraph checkpoint（自带）；Redis（队列）
#   Agent Chat UI（可选，随部署一起启动）：Next.js 聊天前端，passthrough 经容器网络连 aegra
#
# 目录约定（可用环境变量覆盖）：
#   /data/git/aegra            Aegra 源码        覆盖：AEGRA_SRC_DIR
#   /data/git/agent-chat-ui    Chat UI 源码      覆盖：CHATUI_SRC_DIR
#   /data/aegra                部署产物（.env/compose/数据卷）  覆盖：AEGRA_DEPLOY_DIR
#
# 用法：
#   bash aegra.sh              一键部署（= up：装依赖→拉源码→生成配置→build→起栈→等就绪）
#   bash aegra.sh deps         仅安装前置依赖（docker / compose / git / curl / openssl / python3.12+uv）
#   bash aegra.sh clone        仅拉取/更新源码（Aegra + Chat UI）
#   bash aegra.sh gen          仅生成 .env / docker-compose.yml（不启动）
#   bash aegra.sh build        仅构建镜像（不启动）
#   bash aegra.sh up           部署或更新（幂等）
#   bash aegra.sh restart [服务]  重启（默认全部，可指定 aegra/chatui/postgres/redis）
#   bash aegra.sh status       查看各服务状态
#   bash aegra.sh logs [服务]  跟踪日志（默认 aegra）
#   bash aegra.sh down         停止（保留数据）
#   bash aegra.sh nuke         彻底销毁：停容器+删卷+删网络+删本地镜像（并可选删源码与配置）
#   bash aegra.sh help         显示本帮助
#
# 关键环境变量（首次 up 前可 export 覆盖）：
#   LITELLM_API_KEY            LiteLLM 网关（mspbots aigateway）的 key（不填则写占位，调用 LLM 会失败）
#   LITELLM_BASE_URL           网关地址（默认 https://aigateway-sandbox.mspbots.ai/v1）
#   AEGRA_WITH_CHATUI          1=随部署启动 Agent Chat UI（默认）；0=不部署
#   AEGRA_REPO / AEGRA_BRANCH  Aegra 源码仓库地址 / 分支（默认 ibbybuilds/aegra @ main）
#   AEGRA_PORT / CHATUI_PORT   Aegra / Chat UI 对外端口（默认 2026 / 3000）
#
# 目标系统：Linux（自适应 apt/dnf/yum/apk）。macOS 仅支持已装好 Docker Desktop 的场景。
# 本脚本须以 LF 换行在 Linux 上运行；Windows 编辑后请确保未被转成 CRLF。
# ============================================================================
# 兼容性保险：若被非 bash（如 sh/dash）启动，转交 bash 重新执行本脚本
if [ -z "${BASH_VERSION:-}" ]; then exec bash "$0" "$@"; fi
set -euo pipefail

# ---- 目录与基本配置（均可用环境变量覆盖）----
SRC_DIR="${AEGRA_SRC_DIR:-/data/git/aegra}"        # Aegra 源码目录
DEPLOY_DIR="${AEGRA_DEPLOY_DIR:-/data/aegra}"      # 部署目录（生成配置 + 数据卷）
AEGRA_REPO="${AEGRA_REPO:-https://github.com/ibbybuilds/aegra.git}"
AEGRA_BRANCH="${AEGRA_BRANCH:-main}"
PORT_VAL="${AEGRA_PORT:-2026}"

# ---- deepagent（本仓库 packages/deepagent：挂进 aegra 容器并用其 aegra.json）----
SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
# 默认指向同仓库的 packages/deepagent；部署机上仓库不在此处时用 DEEPAGENT_DIR 覆盖为实际路径
DEEPAGENT_DIR="${DEEPAGENT_DIR:-$SELF_DIR/../../packages/deepagent}"
[ -d "$DEEPAGENT_DIR" ] && DEEPAGENT_DIR="$(cd "$DEEPAGENT_DIR" && pwd)"
export DEEPAGENT_DIR   # 供 docker compose 变量插值

# 远程 LiteLLM 网关（来自 packages/opencode/opencode.json）——无需本地部署，Aegra 直连
GATEWAY_BASE_URL="${LITELLM_BASE_URL:-https://aigateway-sandbox.mspbots.ai/v1}"
GATEWAY_API_KEY="${LITELLM_API_KEY:-please-fill-your-mspbots-litellm-key}"
DEFAULT_MODEL_VAL="${AEGRA_DEFAULT_MODEL:-gemini-3-flash-preview}"

# Agent Chat UI（随部署一起启动的 Web 聊天前端；用 compose profile 控制开关）
CHATUI_ENABLED="${AEGRA_WITH_CHATUI:-1}"           # 1=部署 Chat UI（默认）；0=不部署
CHATUI_REPO="${CHATUI_REPO:-https://github.com/langchain-ai/agent-chat-ui.git}"
CHATUI_BRANCH="${CHATUI_BRANCH:-main}"
CHATUI_SRC_DIR="${CHATUI_SRC_DIR:-/data/git/agent-chat-ui}"
CHATUI_PORT_VAL="${CHATUI_PORT:-3000}"
CHATUI_GRAPH_ID_VAL="${CHATUI_GRAPH_ID:-agent}"

ENV_FILE=".env"
COMPOSE_FILE="docker-compose.yml"
HEALTH_URL="http://localhost:${PORT_VAL}/health"
DOCS_URL="http://localhost:${PORT_VAL}/docs"
REDOC_URL="http://localhost:${PORT_VAL}/redoc"

# 启用 Chat UI 时，让所有 docker compose 调用都带上 chatui profile
if [ "$CHATUI_ENABLED" = "1" ]; then export COMPOSE_PROFILES=chatui; fi

# ---- 小工具 ----
log()  { echo "▶ $*"; }
ok()   { echo "  ✓ $*"; }
warn() { echo "⚠ $*" >&2; }
die()  { echo "✗ $*" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }
rnd_pw()  { openssl rand -hex 24; }   # 密码：纯十六进制，避免 URL/命令行解析问题
dc()      { docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"; }

# sudo 处理：非 root 时尽量用 sudo 提权安装/建目录
SUDO=""
if [ "$(id -u)" -ne 0 ]; then
  if have sudo; then SUDO="sudo"; fi
fi

# ---- 包管理器探测与安装 ----
PKG=""
detect_pkg() {
  if   have apt-get; then PKG=apt
  elif have dnf;     then PKG=dnf
  elif have yum;     then PKG=yum
  elif have apk;     then PKG=apk
  elif have brew;    then PKG=brew
  else PKG=""; fi
}

pkg_install() {
  [ "$#" -gt 0 ] || return 0
  case "$PKG" in
    apt) $SUDO apt-get update -y && $SUDO DEBIAN_FRONTEND=noninteractive apt-get install -y "$@" ;;
    dnf) $SUDO dnf install -y "$@" ;;
    yum) $SUDO yum install -y "$@" ;;
    apk) $SUDO apk add --no-cache "$@" ;;
    brew) brew install "$@" ;;
    *) die "未识别的包管理器，请手动安装：$*" ;;
  esac
}

ensure_base_tools() {
  detect_pkg
  local need=()
  have curl    || need+=(curl)
  have git     || need+=(git)
  have openssl || need+=(openssl)
  if [ "${#need[@]}" -gt 0 ]; then
    log "安装基础工具：${need[*]}"
    [ "$PKG" = apt ] && pkg_install ca-certificates
    pkg_install "${need[@]}"
    ok "基础工具就绪"
  fi
}

ensure_docker() {
  if have docker; then return 0; fi
  log "未检测到 docker，使用官方脚本安装（get.docker.com）…"
  case "$PKG" in
    brew) die "macOS 请先手动安装 Docker Desktop 后重试" ;;
    "")   die "无法自动安装 docker，请手动安装 Docker Engine 后重试" ;;
  esac
  curl -fsSL https://get.docker.com | $SUDO sh
  $SUDO systemctl enable --now docker >/dev/null 2>&1 || true
  if [ -n "$SUDO" ] && [ -n "${SUDO_USER:-${USER:-}}" ]; then
    $SUDO usermod -aG docker "${SUDO_USER:-$USER}" >/dev/null 2>&1 || true
    warn "已将用户加入 docker 组，可能需要重新登录后免 sudo 使用 docker"
  fi
  ok "docker 安装完成"
}

ensure_compose() {
  if docker compose version >/dev/null 2>&1; then return 0; fi
  log "安装 docker compose v2 插件…"
  case "$PKG" in
    apt|dnf|yum) pkg_install docker-compose-plugin ;;
    apk) pkg_install docker-cli-compose ;;
    *) die "请手动安装 docker compose v2（命令形如 docker compose ...）" ;;
  esac
  docker compose version >/dev/null 2>&1 || die "docker compose v2 仍不可用，请手动安装"
  ok "docker compose v2 就绪"
}

ensure_python_uv() {
  # Aegra 官方前置：Python 3.12+ 与 uv（用于本地 dev/CLI/迁移；Docker 部署时容器内已自带）。
  if ! have uv; then
    log "安装 uv（Python 版本/包管理器）…"
    curl -LsSf https://astral.sh/uv/install.sh | sh || warn "uv 安装失败（不影响 Docker 部署）"
    export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"
  fi
  if have python3 && python3 -c 'import sys; raise SystemExit(0 if sys.version_info[:2] >= (3,12) else 1)' 2>/dev/null; then
    ok "已检测到 Python 3.12+"
  elif have uv; then
    log "经 uv 安装 Python 3.12…"
    uv python install 3.12 >/dev/null 2>&1 && ok "Python 3.12 就绪（uv 管理）" \
      || warn "uv 安装 Python 3.12 失败（不影响 Docker 部署）"
  else
    warn "未安装 Python 3.12（Docker 部署不受影响；如需本地 dev 请手动安装）"
  fi
}

require_runtime() {
  have docker || die "未检测到 docker，请先运行：bash aegra.sh deps"
  docker compose version >/dev/null 2>&1 || die "需要 docker compose v2，请先运行：bash aegra.sh deps"
}

# 校验 deepagent 目录就绪（挂进容器 /app/deepagent，提供 main/analysis 两个图）
check_deepagent() {
  if [ ! -f "$DEEPAGENT_DIR/aegra.json" ]; then
    die "未找到 deepagent：$DEEPAGENT_DIR/aegra.json
       请用 DEEPAGENT_DIR 指向仓库的 packages/deepagent，例如：
       DEEPAGENT_DIR=/abs/path/to/openconsole/packages/deepagent bash aegra.sh up"
  fi
  ok "deepagent 就绪：$DEEPAGENT_DIR → 容器 /app/deepagent（graphs：main / analysis）"
}

# ---- 目录准备 ----
ensure_dir() {
  local d="$1"
  if [ ! -d "$d" ]; then
    $SUDO mkdir -p "$d" || die "无法创建目录：$d"
    $SUDO chown "$(id -u):$(id -g)" "$d" 2>/dev/null || true
  fi
}

# ---- 通用：把某仓库同步到某目录（支持已存在的非 git 目录，原地接管）----
git_sync() {
  local dir="$1" repo="$2" branch="$3"
  ensure_base_tools
  ensure_dir "$(dirname "$dir")"
  if [ -d "$dir/.git" ]; then
    log "更新源码：$dir（git pull）"
    git -C "$dir" remote set-url origin "$repo" 2>/dev/null || true
    git -C "$dir" pull --ff-only || warn "git pull 失败（可能本地有改动），沿用现有源码"
  elif [ -d "$dir" ] && [ -n "$(ls -A "$dir" 2>/dev/null)" ]; then
    # 目录已存在且非空、但不是 git 仓库：原地纳入 git 并拉取（同名文件被远程覆盖，额外文件保留）
    log "$dir 已存在但非 git 仓库 → 原地初始化并拉取代码（同名文件将被远程覆盖）…"
    git -C "$dir" init -q
    git -C "$dir" remote remove origin 2>/dev/null || true
    git -C "$dir" remote add origin "$repo"
    git -C "$dir" fetch origin "$branch"
    git -C "$dir" reset --hard FETCH_HEAD
    git -C "$dir" checkout -B "$branch" >/dev/null 2>&1 || true
    git -C "$dir" branch --set-upstream-to="origin/$branch" >/dev/null 2>&1 || true
  else
    log "克隆源码：$repo ($branch) → $dir"
    git clone --branch "$branch" "$repo" "$dir"
  fi
}

clone_aegra() {
  git_sync "$SRC_DIR" "$AEGRA_REPO" "$AEGRA_BRANCH"
  [ -f "$SRC_DIR/deployments/docker/Dockerfile" ] || die "Aegra 源码异常：缺少 deployments/docker/Dockerfile（请确认仓库地址/分支正确）"
  [ -f "$SRC_DIR/aegra.json" ] || die "Aegra 源码异常：缺少 aegra.json"
  ok "Aegra 源码就绪：$SRC_DIR"
}

clone_chatui() {
  [ "$CHATUI_ENABLED" = "1" ] || return 0
  git_sync "$CHATUI_SRC_DIR" "$CHATUI_REPO" "$CHATUI_BRANCH"
  [ -f "$CHATUI_SRC_DIR/package.json" ] || die "Agent Chat UI 源码异常：缺少 package.json"
  ok "Agent Chat UI 源码就绪：$CHATUI_SRC_DIR"
}

# ---- 生成 .env（仅首次；密钥随机且此后稳定）----
ensure_env() {
  if [ -f "$ENV_FILE" ]; then
    ok ".env 已存在，跳过生成（如需重置请删除 $DEPLOY_DIR/$ENV_FILE 后重跑）"
    return 0
  fi
  have openssl || die "生成密钥需要 openssl，请先运行：bash aegra.sh deps"
  log "生成 $ENV_FILE 与随机密钥…"
  local pg_pw ip
  pg_pw="$(rnd_pw)"
  ip="$(hostname -I 2>/dev/null | awk '{print $1}')" || true; [ -n "${ip:-}" ] || ip="localhost"
  cat > "$ENV_FILE" <<EOF
# ============================================================================
# 本文件由 aegra.sh 自动生成，含明文密钥——已被 .gitignore 忽略，请勿提交 git。
# ============================================================================

# ---- 编排参数（供 docker compose 变量插值用）----
AEGRA_SRC_DIR=$SRC_DIR
PORT=$PORT_VAL
PGVECTOR_IMAGE=pgvector/pgvector:pg18
REDIS_IMAGE=redis:7-alpine
WORKER_COUNT=3
N_JOBS_PER_WORKER=10

# ---- Aegra 应用 ----
PROJECT_NAME=Aegra
VERSION=0.1.0
DEBUG=false
AEGRA_CONFIG=aegra.json
RUN_MIGRATIONS_ON_STARTUP=true
HOST=0.0.0.0
LOG_LEVEL=INFO
ENV_MODE=PRODUCTION
LOG_VERBOSITY=standard
AUTH_TYPE=noop

# ---- 数据库（容器网络内，主机名即服务名 postgres）----
POSTGRES_DB=aegra
POSTGRES_USER=aegra
POSTGRES_PASSWORD=$pg_pw
POSTGRES_HOST=postgres
POSTGRES_PORT=5432
DATABASE_URL=postgresql://aegra:$pg_pw@postgres:5432/aegra
DB_ECHO_LOG=false
SQLALCHEMY_POOL_SIZE=10
SQLALCHEMY_MAX_OVERFLOW=20
LANGGRAPH_MIN_POOL_SIZE=5
LANGGRAPH_MAX_POOL_SIZE=20

# ---- Redis / WorkerExecutor（架构图：Runner Pool + 异步执行 + 租约崩溃恢复）----
REDIS_BROKER_ENABLED=true
REDIS_URL=redis://redis:6379/0

# ---- Cron 调度 ----
CRON_ENABLED=true

# ---- LLM：直连远程 LiteLLM 网关（架构图统一入口；mspbots aigateway，无需本地部署）----
OPENAI_BASE_URL=$GATEWAY_BASE_URL
OPENAI_API_BASE=$GATEWAY_BASE_URL
OPENAI_API_KEY=$GATEWAY_API_KEY
# 可选模型：gemini-3-flash-preview / gemini-3-pro-preview / gemini-3.1-pro-preview /
#   gemini-3-deep-think-preview / gemini-2.5-flash
DEFAULT_MODEL=$DEFAULT_MODEL_VAL

# ---- Agent Chat UI（随部署启动；passthrough 经容器网络连 aegra，绕 CORS）----
CHATUI_GRAPH_ID=$CHATUI_GRAPH_ID_VAL
CHATUI_PORT=$CHATUI_PORT_VAL
CHATUI_SRC_DIR=$CHATUI_SRC_DIR
NODE_IMAGE=node:20-bookworm-slim
# 浏览器访问 Chat UI 的地址 + /api（默认本机 IP；跨机访问如有需要改成对应可达地址）
CHATUI_PUBLIC_API_URL=http://${ip}:${CHATUI_PORT_VAL}/api

# ---- 可观测性（占位，默认关闭；如需接入 Langfuse：填 key 并设 OTEL_TARGETS=LANGFUSE）----
OTEL_SERVICE_NAME=aegra-backend
OTEL_TARGETS=
OTEL_CONSOLE_EXPORT=false
LANGFUSE_BASE_URL=https://cloud.langfuse.com
LANGFUSE_PUBLIC_KEY=
LANGFUSE_SECRET_KEY=

# ---- Prometheus 指标（占位，默认关闭）----
ENABLE_PROMETHEUS_METRICS=false
EOF
  ok "已生成 $DEPLOY_DIR/$ENV_FILE（含全部密钥，请妥善保管，勿提交 git）"
  if [ "$GATEWAY_API_KEY" = "please-fill-your-mspbots-litellm-key" ]; then
    warn "OPENAI_API_KEY（LiteLLM 网关 key）当前为占位值，部署可启动但调用 LLM 会失败。"
    warn "  请编辑 $DEPLOY_DIR/.env 填入真实 key，再执行：bash aegra.sh restart aegra"
  fi
}

# ---- 生成 docker-compose.yml（每次覆盖：纯模板、无密钥；改脚本即升级编排）----
write_compose() {
  cat > "$COMPOSE_FILE" <<'AEGRA_COMPOSE'
# 本文件由 aegra.sh 自动生成，请勿手改（改 aegra.sh 内模板）。
# 服务：postgres(+pgvector) / redis / aegra（控制平面+WorkerExecutor）/ chatui（Agent Chat UI，profile 控制）。
# LLM 走远程 LiteLLM 网关（见 .env：OPENAI_BASE_URL），不在本地部署。
# 对外暴露 aegra(${PORT}) 与 chatui(${CHATUI_PORT})；postgres/redis 绑 127.0.0.1。
name: aegra

services:
  # PostgreSQL + pgvector：assistants/threads/runs 元数据 + LangGraph checkpoint + 向量检索
  postgres:
    image: ${PGVECTOR_IMAGE:-pgvector/pgvector:pg18}
    container_name: aegra-postgres
    restart: unless-stopped
    env_file: [.env]
    environment:
      POSTGRES_DB: ${POSTGRES_DB:-aegra}
      POSTGRES_USER: ${POSTGRES_USER:-aegra}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-aegra}
      TZ: UTC
      PGTZ: UTC
    ports:
      - "127.0.0.1:5432:5432"
    volumes:
      - aegra_postgres_data:/var/lib/postgresql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $$POSTGRES_USER -d $$POSTGRES_DB"]
      interval: 5s
      timeout: 5s
      retries: 10

  # Redis：WorkerExecutor 作业队列（BLPOP）+ 多实例 SSE 流式 pub/sub + 回放
  redis:
    image: ${REDIS_IMAGE:-redis:7-alpine}
    container_name: aegra-redis
    restart: unless-stopped
    ports:
      - "127.0.0.1:6379:6379"
    volumes:
      - aegra_redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 10

  # Aegra 控制平面（FastAPI）+ WorkerExecutor（同进程内，REDIS_BROKER_ENABLED=true）
  aegra:
    build:
      context: ${AEGRA_SRC_DIR:-/data/git/aegra}
      dockerfile: deployments/docker/Dockerfile
    container_name: aegra-server
    restart: unless-stopped
    env_file: [.env]
    environment:
      POSTGRES_HOST: postgres
      PYTHONPATH: /app/src:/app/deepagent/src
      AEGRA_CONFIG: /app/deepagent/aegra.json
      REDIS_BROKER_ENABLED: "true"
      REDIS_URL: redis://redis:6379/0
      WORKER_COUNT: ${WORKER_COUNT:-3}
      N_JOBS_PER_WORKER: ${N_JOBS_PER_WORKER:-10}
    depends_on:
      postgres: { condition: service_healthy }
      redis: { condition: service_healthy }
    ports:
      - "${PORT:-2026}:${PORT:-2026}"
    healthcheck:
      test: ["CMD-SHELL", "curl -sf http://localhost:$${PORT:-2026}/health || exit 1"]
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 40s
    volumes:
      - ${AEGRA_SRC_DIR:-/data/git/aegra}/aegra.json:/app/aegra.json:ro
      - ${AEGRA_SRC_DIR:-/data/git/aegra}/examples:/app/examples:ro
      - ${AEGRA_SRC_DIR:-/data/git/aegra}/libs/aegra-api/src:/app/src:ro
      - ${AEGRA_SRC_DIR:-/data/git/aegra}/libs/aegra-api/alembic:/app/alembic:ro
      # 本仓库 packages/deepagent：提供 main/analysis 两个图(见容器内 /app/deepagent/aegra.json)
      - ${DEEPAGENT_DIR}:/app/deepagent:ro
    # 启动前安装 deepagent 依赖(deepagents 等)；生产建议改为 fork Aegra 在 Dockerfile 里预装，免每次启动等待。
    command: ["sh", "-c", "pip install -q -r /app/deepagent/requirements.txt && exec uvicorn aegra_api.main:app --host 0.0.0.0 --port ${PORT:-2026} --reload"]

  # Agent Chat UI（Next.js）：Web 聊天前端。profile=chatui 控制是否启动。
  # passthrough：浏览器 → chatui:/api → 服务端转发到 http://aegra:2026（容器网络，绕 CORS）。
  chatui:
    image: ${NODE_IMAGE:-node:20-bookworm-slim}
    container_name: aegra-chatui
    restart: unless-stopped
    profiles: ["chatui"]
    working_dir: /app
    environment:
      NEXT_PUBLIC_ASSISTANT_ID: ${CHATUI_GRAPH_ID:-agent}
      LANGGRAPH_API_URL: http://aegra:${PORT:-2026}
      NEXT_PUBLIC_API_URL: ${CHATUI_PUBLIC_API_URL:-http://localhost:3000/api}
      LANGSMITH_API_KEY: ""
    depends_on:
      aegra: { condition: service_healthy }
    ports:
      - "${CHATUI_PORT:-3000}:3000"
    volumes:
      - ${CHATUI_SRC_DIR:-/data/git/agent-chat-ui}:/app
    command: ["sh", "-c", "corepack enable && pnpm install && exec pnpm dev -- -H 0.0.0.0 -p 3000"]

volumes:
  aegra_postgres_data:
  aegra_redis_data:
AEGRA_COMPOSE
  ok "已生成 $DEPLOY_DIR/$COMPOSE_FILE"
}

# ---- 等待就绪 ----
wait_ready() {
  log "等待 aegra 就绪（首次需 build + 拉镜像 + 数据库迁移，请耐心等待）…"
  local ok=""
  for _ in $(seq 1 80); do
    if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then ok=1; break; fi
    sleep 3
  done
  [ -n "$ok" ] && return 0 || return 1
}

print_info() {
  local ip
  ip="$(hostname -I 2>/dev/null | awk '{print $1}')" || true; [ -n "${ip:-}" ] || ip="<服务器IP>"
  echo
  echo "============================================================"
  echo "✅ Aegra 部署完成"
  echo
  echo "  自动生成的配置（含密钥，已被 .gitignore 忽略，勿提交 git）："
  echo "   • 环境变量 ： $DEPLOY_DIR/.env"
  echo "   • 编排文件 ： $DEPLOY_DIR/docker-compose.yml"
  echo "   • Aegra 源码 ： $SRC_DIR"
  [ "$CHATUI_ENABLED" = "1" ] && echo "   • ChatUI 源码： $CHATUI_SRC_DIR"
  echo "   • deepagent  ： $DEEPAGENT_DIR → 容器 /app/deepagent（graphs：main / analysis）"
  echo
  if [ "$CHATUI_ENABLED" = "1" ]; then
    echo "  💬 Agent Chat UI（已随部署启动，打开即用，无需任何前端配置）："
    echo "   • 聊天界面 ： http://$ip:${CHATUI_PORT_VAL}"
    echo "     （图=${CHATUI_GRAPH_ID_VAL}；首次启动需容器内 pnpm install + 编译，约 1-3 分钟）"
    echo "     （日志：bash aegra.sh logs chatui）"
    echo
  fi
  echo "  Aegra Web 访问地址："
  echo "   • API 文档(Swagger) ： http://$ip:${PORT_VAL}/docs"
  echo "   • API 文档(ReDoc)   ： http://$ip:${PORT_VAL}/redoc"
  echo "   • 健康检查          ： http://$ip:${PORT_VAL}/health"
  echo
  echo "  LLM 网关（远程，Aegra 直连，无需本地部署）：$GATEWAY_BASE_URL"
  echo
  echo "  下一步："
  echo "   • LLM key：编辑 $DEPLOY_DIR/.env 的 OPENAI_API_KEY 后 bash aegra.sh restart aegra"
  echo "   • 接入自定义 deepagents 图：把图放进 $SRC_DIR/examples 并改 $SRC_DIR/aegra.json，再 bash aegra.sh restart aegra"
  echo "   • 查看日志：bash aegra.sh logs [aegra|chatui]"
  echo "============================================================"
}

# ---- 子命令 ----
cmd_deps() {
  log "安装前置依赖…"
  ensure_base_tools
  ensure_docker
  ensure_compose
  ensure_python_uv
  ok "前置依赖检查完成"
}

cmd_clone() { clone_aegra; clone_chatui; }

cmd_gen() {
  ensure_env
  write_compose
  ok "已在 $DEPLOY_DIR 生成 $ENV_FILE / $COMPOSE_FILE（未启动）"
}

cmd_build() {
  require_runtime
  check_deepagent
  clone_aegra; clone_chatui
  ensure_env
  write_compose
  log "构建镜像…"
  dc build
  ok "构建完成"
}

cmd_up() {
  log "部署目录：$DEPLOY_DIR ｜ Aegra 源码：$SRC_DIR ｜ Chat UI：$([ "$CHATUI_ENABLED" = 1 ] && echo 启用 || echo 关闭)"
  check_deepagent
  cmd_deps
  clone_aegra
  clone_chatui
  ensure_env
  write_compose
  require_runtime
  log "构建并启动 Aegra 全栈…"
  dc up -d --build
  if wait_ready; then
    print_info
  else
    warn "等待超时（镜像可能仍在拉取/构建，或数据库迁移中）。查看日志："
    echo "   bash aegra.sh logs"
    echo "   bash aegra.sh status"
  fi
}

cmd_restart() {
  require_runtime
  write_compose
  log "重启服务：${1:-全部}"
  if [ -n "${1:-}" ]; then dc restart "$1"; else dc restart; fi
  ok "已重启"
}

cmd_down()   { require_runtime; write_compose; log "停止服务（保留数据）…"; dc down; ok "已停止"; }
cmd_logs()   { require_runtime; write_compose; dc logs -f "${1:-aegra}"; }
cmd_status() { require_runtime; write_compose; dc ps; }

cmd_nuke() {
  require_runtime; write_compose
  warn "彻底销毁：将停止并删除本部署的容器、数据卷、网络与本地构建镜像（不可恢复）。"
  read -r -p "确认请输入 yes： " ans
  [ "$ans" = "yes" ] || { echo "已取消"; return 0; }
  log "停止容器并删除卷/网络/本地镜像…"
  dc down -v --remove-orphans --rmi local || true
  ok "已删除容器 / 数据卷 / 网络 / 本地构建镜像。"
  echo
  read -r -p "是否同时删除源码与部署配置（$SRC_DIR、$CHATUI_SRC_DIR、$DEPLOY_DIR/.env、$DEPLOY_DIR/$COMPOSE_FILE）？输入 yes 删除： " ans2
  if [ "$ans2" = "yes" ]; then
    [ -n "$SRC_DIR" ]        && $SUDO rm -rf "$SRC_DIR"
    [ -n "$CHATUI_SRC_DIR" ] && $SUDO rm -rf "$CHATUI_SRC_DIR"
    rm -f "$DEPLOY_DIR/$ENV_FILE" "$DEPLOY_DIR/$COMPOSE_FILE"
    ok "已删除源码与部署配置。下次 up 为全新部署。"
  else
    ok "已保留源码与 .env（下次 up 复用）。"
  fi
}

usage() {
  cat <<EOF
Aegra 一键部署    部署目录：$DEPLOY_DIR
  Aegra 源码：$SRC_DIR ｜ Chat UI 源码：$CHATUI_SRC_DIR ｜ Chat UI：$([ "$CHATUI_ENABLED" = 1 ] && echo 启用 || echo 关闭)
（可用环境变量覆盖：AEGRA_SRC_DIR / AEGRA_DEPLOY_DIR / AEGRA_REPO / AEGRA_BRANCH / AEGRA_PORT / CHATUI_PORT / AEGRA_WITH_CHATUI）

用法：
  bash aegra.sh [up]              一键部署（装依赖→拉源码→生成配置→build→起栈→等就绪）
  bash aegra.sh deps             仅安装前置依赖
  bash aegra.sh clone            仅拉取/更新源码（Aegra + Chat UI）
  bash aegra.sh gen              仅生成 .env / docker-compose.yml
  bash aegra.sh build            仅构建镜像（不启动）
  bash aegra.sh restart [服务]   重启（默认全部，可指定 aegra/chatui/postgres/redis）
  bash aegra.sh status           各服务状态
  bash aegra.sh logs [服务]      跟踪日志（默认 aegra；Chat UI 用 logs chatui）
  bash aegra.sh down             停止（保留数据）
  bash aegra.sh nuke             彻底销毁：停容器+删卷+删网络+删本地镜像（并可选删源码与配置）
  bash aegra.sh help             显示本帮助

首次部署：
  LITELLM_API_KEY=sk-xxxx bash aegra.sh up                       # 含 Agent Chat UI（默认）
  AEGRA_WITH_CHATUI=0 LITELLM_API_KEY=sk-xxxx bash aegra.sh up   # 不部署 Chat UI
EOF
}

# ---- 入口 ----
main() {
  local cmd="${1:-up}"
  case "$cmd" in
    help|-h|--help) usage; exit 0 ;;
  esac
  shift || true
  ensure_dir "$DEPLOY_DIR"
  cd "$DEPLOY_DIR"
  DEPLOY_DIR="$(pwd)"   # 规范化为绝对路径
  case "$cmd" in
    up|"")        cmd_up ;;
    deps)         cmd_deps ;;
    clone|pull)   cmd_clone ;;
    gen)          cmd_gen ;;
    build)        cmd_build ;;
    restart)      cmd_restart "${1:-}" ;;
    down|stop)    cmd_down ;;
    logs)         cmd_logs "${1:-}" ;;
    status|ps)    cmd_status ;;
    nuke|destroy) cmd_nuke ;;
    *) echo "未知命令：$cmd"; echo; usage; exit 1 ;;
  esac
}

main "$@"
