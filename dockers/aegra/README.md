# Aegra 一键部署

自托管 [Aegra](https://github.com/ibbybuilds/aegra)（LangGraph Platform 的开源替代品）的单脚本一键部署方案，按「Agent 完整架构」图落地，并**随部署自带一个 Web 聊天界面（Agent Chat UI）**，打开即用。

参考 `langfuse.sh` 的设计哲学：**单脚本自包含**——自动检测安装依赖、拉源码、生成全部配置（随机密钥）、编译并拉起全栈，且支持一键彻底销毁。

## 架构组件对应

| 架构图组件 | 落地实现 |
|---|---|
| 客户端 ──HTTP/SSE(Agent Protocol)──▶ | 对外端口 `2026` |
| Aegra Web · FastAPI（控制平面） | `aegra` 服务（uvicorn，认证/Assistants/Threads/Runs/SSE） |
| WorkerExecutor（Redis 队列 + 异步执行 + 租约恢复） | `REDIS_BROKER_ENABLED=true` + `WORKER_COUNT` × `N_JOBS_PER_WORKER` |
| main / analysis graph · deepagents | `aegra.json` 的 `graphs` 配置（官方仓库自带 react_agent 等示例图） |
| LiteLLM 网关（统一 LLM 入口） | **远程 mspbots aigateway，无需本地部署**；Aegra 经 `OPENAI_BASE_URL` 直连 |
| 数据与存储层（PostgreSQL + pgvector + checkpoint） | `postgres` 服务（`pgvector/pgvector:pg18`） |
| Redis（队列 + SSE pub/sub） | `redis` 服务（`redis:7-alpine`） |
| Web 聊天界面 | `chatui` 服务（Agent Chat UI，Next.js，passthrough 经容器网络连 `aegra`） |

本地部署 4 个服务：`postgres` / `redis` / `aegra` / `chatui`（Chat UI 默认启用，可关）。LiteLLM 是已有的远程网关，不在部署范围。

## 目录约定

| 路径 | 用途 | 覆盖变量 |
|---|---|---|
| `/data/git/aegra` | Aegra 源码 | `AEGRA_SRC_DIR` |
| `/data/git/agent-chat-ui` | Agent Chat UI 源码 | `CHATUI_SRC_DIR` |
| `/data/aegra` | 部署产物（`.env` / `docker-compose.yml` / 数据卷） | `AEGRA_DEPLOY_DIR` |

源码目录保持纯净（便于 `git pull` 升级），所有运行时产物与密钥都落在部署目录，职责分离。

## 前置依赖（脚本自动安装）

自适应 `apt / dnf / yum / apk` 检测并安装：

- **部署必需**：`docker`、`docker compose v2`、`git`、`curl`、`openssl`
- **本地开发用**（按官方前置要求一并装）：`Python 3.12`（经 `uv`）、`uv`

Docker 部署时各组件依赖均在容器内安装，宿主机无需 Node/Python。

## 快速开始

```bash
cd dockers/aegra
# 一键部署：填入 LiteLLM 网关（mspbots aigateway）的 key 后执行
LITELLM_API_KEY=sk-你的key bash aegra.sh up
```

一条命令完成：装依赖 → 拉源码（Aegra + Chat UI）→ 在 `/data/aegra` 生成配置 → `docker compose build` → 起全栈 → 等待就绪并打印访问地址。

**所有配置自动生成到 `/data/aegra/`**：`.env`（含随机密钥）、`docker-compose.yml`。

完成后打印的访问地址：

- 💬 **聊天界面（打开即用）**：`http://<服务器IP>:3000`
- API 文档：`http://<服务器IP>:2026/docs`

> 未提供 `LITELLM_API_KEY` 也能起栈，但调用 LLM 会失败。补 key：编辑 `/data/aegra/.env` 的 `OPENAI_API_KEY`，再 `bash aegra.sh restart aegra`。
>
> 不想要 Chat UI：`AEGRA_WITH_CHATUI=0 LITELLM_API_KEY=sk-xxx bash aegra.sh up`。

## Web 访问地址与 UI

> `<服务器IP>` 换成实际地址；本机调试可用 `localhost`。端口由 `AEGRA_PORT` / `CHATUI_PORT` 决定（默认 `2026` / `3000`）。

| 用途 | 地址 |
|---|---|
| 💬 **Agent Chat UI（聊天，随部署启动）** | `http://<服务器IP>:3000` |
| API 文档（Swagger UI） | `http://<服务器IP>:2026/docs` |
| API 文档（ReDoc） | `http://<服务器IP>:2026/redoc` |
| 健康检查 | `http://<服务器IP>:2026/health` |

Chat UI 已通过 **passthrough**（容器内 `http://aegra:2026`）连好 Aegra，**打开就能聊，无需在页面填任何配置**。首次启动需在容器内 `pnpm install` + 编译，约 1–3 分钟，可 `bash aegra.sh logs chatui` 观察。

如果想用其它前端（**LangGraph Studio / CopilotKit**），指向 `http://<服务器IP>:2026` 即可；`AUTH_TYPE=noop` 时 API Key 留空。

## 常用命令

```bash
bash aegra.sh            # 一键部署 / 更新（幂等）
bash aegra.sh deps       # 仅安装前置依赖
bash aegra.sh clone      # 仅拉取/更新源码（Aegra + Chat UI）
bash aegra.sh gen        # 仅生成配置（不启动）
bash aegra.sh build      # 仅构建镜像
bash aegra.sh restart [服务]   # 重启（默认全部；可指定 aegra/chatui/postgres/redis）
bash aegra.sh status     # 各服务状态
bash aegra.sh logs [服务]      # 跟踪日志（默认 aegra；聊天页用 logs chatui）
bash aegra.sh down       # 停止（保留数据）
bash aegra.sh nuke       # 彻底销毁（见下）
```

## 停止与销毁

| 命令 | 作用 | 保留什么 |
|---|---|---|
| `bash aegra.sh down` | 停止所有容器 | 数据卷、镜像、源码、`.env` 全保留，`up` 可秒级恢复 |
| `bash aegra.sh nuke` | **彻底销毁**：停容器 + 删数据卷 + 删网络 + 删本地构建镜像（`down -v --remove-orphans --rmi local`） | 默认保留源码与 `.env`；会**二次询问**是否连同 `/data/git/aegra`、`/data/git/agent-chat-ui`、`/data/aegra/.env`、`docker-compose.yml` 一起删除 |

`nuke` 第一步不可恢复（数据卷删除）；第二步（删源码与配置）需再次输入 `yes` 才执行，全部删除后下次 `up` 即全新部署。

## LLM 网关（直连远程，无需本地部署）

LLM 调用统一走远程 LiteLLM 网关（来自 `packages/opencode/opencode.json`），Aegra 以 OpenAI 兼容协议直连，配置写在 `/data/aegra/.env`：

```bash
OPENAI_BASE_URL=https://aigateway-sandbox.mspbots.ai/v1
OPENAI_API_KEY=<网关 key>     # 对应 opencode.json 的 LITELLM_API_KEY
DEFAULT_MODEL=gemini-3-flash-preview
```

网关提供的模型：`gemini-3-flash-preview`、`gemini-3-pro-preview`、`gemini-3.1-pro-preview`、`gemini-3-deep-think-preview`、`gemini-2.5-flash`。改 key / 网关：编辑 `.env` 后 `bash aegra.sh restart aegra`。

## 接入自定义 deepagents 图

当前为官方仓库 + 自带示例图（`react_agent` 等）。要换成架构图里的 main / analysis graph（deepagents）：

1. 把图代码放进 `/data/git/aegra/examples/`（如 `examples/main_graph/graph.py:graph`）
2. 编辑 `/data/git/aegra/aegra.json` 的 `graphs`，加入 `"main": "./examples/main_graph/graph.py:graph"` 等
3. `bash aegra.sh restart aegra`；如需在 Chat UI 选用该图，改 `.env` 的 `CHATUI_GRAPH_ID` 后 `bash aegra.sh restart chatui`

> `aegra.json` 在源码目录，`git pull` 可能覆盖；长期建议 fork 后用 `AEGRA_REPO` 指向你的 fork。
> **模型名**：图里用的模型名需是网关已配置的（gemini 系列）。示例图若默认用别的名（如 `gpt-4o`），改成 `gemini-3-flash-preview` 或在网关侧加别名。

## 数据与备份

PostgreSQL / Redis 使用 docker 具名卷（`aegra_postgres_data` / `aegra_redis_data`）：

```bash
docker exec aegra-postgres pg_dump -U aegra aegra > aegra_$(date +%F).sql
```

## 故障排查

- **`$'\r': command not found` / 语法错误**：脚本被转成 CRLF。`sed -i 's/\r$//' aegra.sh`（仓库已带 `.gitattributes` 强制 `*.sh` 为 LF）。
- **docker 权限拒绝**：把用户加入 docker 组后重新登录，或用 `sudo` 运行。
- **端口被占用**：`AEGRA_PORT=8080 CHATUI_PORT=8081 bash aegra.sh up`。
- **聊天页打不开 / 502**：首次 `chatui` 要 `pnpm install` + 编译，等 1–3 分钟；`bash aegra.sh logs chatui` 看进度。
- **能聊但报模型错**：确认 `.env` 的 `OPENAI_API_KEY` 已填真实网关 key；确认图用的模型名是网关已配置的（gemini 系列）。
- **跨机访问聊天页空白**：`.env` 的 `CHATUI_PUBLIC_API_URL` 默认是部署机探测到的 IP；若你从其它地址访问，改成你浏览器实际访问 `http://<地址>:3000/api` 后 `bash aegra.sh restart chatui`。
- **查看实时状态**：`bash aegra.sh status`、`bash aegra.sh logs aegra`、`bash aegra.sh logs chatui`。
