---
name: skill-creator
description: 创建新 skill、修改和改进现有 skill、衡量 skill 表现。当用户想从零做一个 skill、编辑或优化已有 skill、跑 eval 测试 skill、用方差分析 benchmark skill 表现、或者优化 skill 的 description 以提升触发准确率时使用。
---

# Skill Creator

一个用来创建新 skill 并迭代改进的 skill。

整个流程大致如下：

- 决定 skill 要做什么、大致怎么做
- 写一份 skill 草稿
- 写几个测试 prompt，让 claude-with-access-to-the-skill 跑它们
- 帮用户从定性和定量两方面评估结果
  - 在后台跑测试期间，如果还没定量评估方案就草拟一份（如果已经有，就照用，或视情况修改）。然后向用户解释方案（如果已存在就解释现有的）
  - 用 `eval-viewer/generate_review.py` 脚本把结果展示给用户看，让他们也看定量指标
- 根据用户对结果的评估反馈（以及定量 benchmark 暴露出的明显问题）重写 skill
- 满意为止
- 把测试集扩大，再大规模跑一遍

用本 skill 时你的任务是：搞清楚用户当前处在这个流程的哪一步，然后切入帮他们推进。比如他们说"我想做一个 X 的 skill"，你可以帮他们缩小范围、写草稿、写测试 case、确定怎么评估、跑所有 prompt、迭代。

另一种情况是他们已经有了 skill 草稿。这时直接进入评估/迭代环节。

当然，灵活第一——如果用户说"不用跑一堆评估，先随便和我聊聊"，照办。

skill 做完之后（顺序可以灵活），还可以跑 skill description improver——我们有个独立脚本专门优化 skill 的触发。

明白？好。

## 跟用户沟通

用 skill creator 的人对编程术语的熟悉程度差异很大。如果你还没听说（也难怪——这趋势刚开始），现在 Claude 的能力正在激励水管工打开终端、爸妈和爷爷奶奶 google "怎么装 npm"。另一方面，大部分用户应该还是相当懂电脑的。

所以请注意上下文线索来判断怎么措辞！默认情况下，给你一些参考：

- "evaluation"（评估）和 "benchmark"（基准）——边缘，但 OK
- "JSON" 和 "assertion"（断言）——除非用户明显表现出懂这些概念，否则要解释一下再用

如果不确定，简短解释一下术语是 OK 的；如果你不确定用户能不能理解，不妨加个简短定义。

---

## 创建一个 skill

### 抓住意图

先理解用户意图。当前对话里可能已经包含他们想沉淀成 skill 的工作流（比如他们说"把这个变成 skill"）。如果是这样，先从对话历史里提取答案——用过的工具、步骤顺序、用户做的修正、观察到的 input/output 格式。用户可能要补缺漏，并在进入下一步前确认。

1. 这个 skill 应该让 Claude 能做什么？
2. 什么时候该触发？（什么用户措辞/场景）
3. 期望的输出格式是什么？
4. 是否要建测试 case 来验证 skill 是否生效？输出**客观可验证**（文件转换、数据提取、代码生成、固定流程步骤）的 skill 适合做测试 case；输出**主观**的（写作风格、艺术）通常不需要。根据 skill 类型建议默认做法，但让用户决定。

### 访谈和调研

主动问边界情况、input/output 格式、示例文件、成功标准、依赖。把这部分敲定再开始写测试 prompt。

看一下可用的 MCP——如果对调研有帮助（搜文档、找类似的 skill、查最佳实践），有 subagent 就用 subagent 并行调研，没有就在主线里查。带着上下文进来，减少用户的负担。

### 写 SKILL.md

基于对用户的访谈，填这几项：

- **name**：skill 标识符
- **description**：什么时候触发、做什么。**这是主要的触发机制**——既要包括 skill 做什么，也要包括具体什么时候用。所有"何时使用"的信息都放在 description 里，**不**放在正文里。注意：目前 Claude 倾向于"少触发"——本该用的时候不用。为了对抗这一点，请让 skill description 略微"咄咄逼人"一点。比如别只写 "How to build a simple fast dashboard to display internal Anthropic data."，可以写成 "How to build a simple fast dashboard to display internal Anthropic data. Make sure to use this skill whenever the user mentions dashboards, data visualization, internal metrics, or wants to display any kind of company data, even if they don't explicitly ask for a 'dashboard.'"
- **compatibility**：所需工具、依赖（可选，很少需要）
- **skill 正文 :)**

### Skill 写作指南

#### Skill 的结构

```
skill-name/
├── SKILL.md (必需)
│   ├── YAML frontmatter (name、description 必填)
│   └── Markdown 指令
└── 捆绑资源 (可选)
    ├── scripts/    - 确定性/重复性任务用的可执行代码
    ├── references/ - 按需载入上下文的文档
    └── assets/     - 输出里用到的文件（模板、图标、字体）
```

#### 渐进式披露

Skill 用三层加载机制：

1. **元数据**（name + description）—— 永远在上下文里（约 100 字）
2. **SKILL.md 正文** —— skill 触发时载入上下文（理想 <500 行）
3. **捆绑资源** —— 按需载入（无限制，scripts 可以直接执行而无需载入正文）

字数是大概的，必要时可以更长。

**关键模式：**

- SKILL.md 控制在 500 行以内；接近上限就加一层层级，并明确告诉调用 skill 的 model 下一步该去哪儿找
- 在 SKILL.md 里清楚地引用文件，说明何时读它们
- 大的 reference 文件（>300 行）加一份目录

**按领域组织**：当一个 skill 支持多个领域/框架时，按变体组织：

```
cloud-deploy/
├── SKILL.md (工作流 + 选择)
└── references/
    ├── aws.md
    ├── gcp.md
    └── azure.md
```

Claude 只读相关的那份 reference 文件。

#### 无意外原则

不用说，skill 里不能有恶意代码、漏洞利用代码、或任何可能破坏系统安全的内容。skill 内容应当与其描述的意图一致，不能让用户感到意外。不要配合做误导性 skill 或用于未授权访问、数据外泄等恶意活动的 skill。"角色扮演成 XYZ" 之类的 OK。

#### 写作模式

指令优先用祈使句。

**定义输出格式** —— 可以这样：

```markdown
## Report 结构

ALWAYS 使用这个模板：

# [Title]

## Executive summary

## Key findings

## Recommendations
```

**示例模式** —— 给示例很有用。可以这样写（但如果 "Input" 和 "Output" 不合适，按情况微调）：

```markdown
## Commit message 格式

**示例 1：**
Input: Added user authentication with JWT tokens
Output: feat(auth): implement JWT-based authentication
```

### 写作风格

跟 model 解释**为什么**事情重要，少用一堆生硬的 MUST。用 theory of mind，让 skill 通用，不要绑死在具体例子上。先写草稿，过一会儿用新鲜的眼光再看一遍，改进它。

### 测试 case

写完 skill 草稿后，想 2-3 个真实的测试 prompt——真用户实际会说的那种话。给用户看：[不必照搬这句话] "这里有几个测试 case 我想跑，看起来合适吗？要不要加几个？" 然后跑。

把测试 case 存到 `evals/evals.json`。先不写断言——只写 prompt。断言在下一步等运行时草拟。

```json
{
  "skill_name": "example-skill",
  "evals": [
    {
      "id": 1,
      "prompt": "用户的任务 prompt",
      "expected_output": "期望结果描述",
      "files": []
    }
  ]
}
```

完整 schema（包括稍后会加的 `assertions` 字段）见 `references/schemas.md`。

## 跑测试 case 并评估

这一节是**连续的一整套流程**——不要做一半停下来。**不要**用 `/skill-test` 或其它测试 skill。

结果放在 `<skill-name>-workspace/` 里，作为 skill 目录的同级文件夹。workspace 内按迭代组织（`iteration-1/`、`iteration-2/`），每个迭代内每个测试 case 一个目录（`eval-0/`、`eval-1/`）。**不要**预先建好这些——边走边创建。

### Step 1：同一回合内 spawn 所有 run（with-skill 和 baseline 都要）

每个测试 case spawn 两个 subagent 在同一回合——一个带 skill，一个不带。**重点**：不要先 spawn with-skill 跑完再回头跑 baseline。一次性全部启动，让它们大概同时完成。

**With-skill run：**

```
执行此任务：
- Skill 路径：<path-to-skill>
- 任务：<eval prompt>
- 输入文件：<eval files if any, or "none">
- 输出保存到：<workspace>/iteration-<N>/eval-<ID>/with_skill/outputs/
- 要保存的输出：<用户关心的东西——比如 ".docx 文件"、"最终的 CSV">
```

**Baseline run**（同 prompt，但 baseline 取决于场景）：

- **创建新 skill**：完全不带 skill。同 prompt，不传 skill 路径，存到 `without_skill/outputs/`
- **改进现有 skill**：用旧版本。编辑前先快照 skill（`cp -r <skill-path> <workspace>/skill-snapshot/`），然后把 baseline subagent 指向快照。存到 `old_skill/outputs/`

为每个测试 case 写一份 `eval_metadata.json`（断言先空着）。给每个 eval 一个描述性的名字，基于它在测什么——别只叫 "eval-0"。目录名也用这个名字。如果本次迭代用了新增/修改的 eval prompt，给每个新 eval 目录建一份这种文件——别假设它从上一次迭代继承。

```json
{
  "eval_id": 0,
  "eval_name": "描述性名字",
  "prompt": "用户的任务 prompt",
  "assertions": []
}
```

### Step 2：跑测试期间，草拟断言

别等运行结果——这段时间可以高效利用。给每个测试 case 草拟定量断言并向用户解释。如果 `evals/evals.json` 里已有断言，review 它们并解释每条在检查什么。

好断言**客观可验证**而且有**描述性名字**——它们应当在 benchmark viewer 里读起来清晰，让人一眼看懂每条在查什么。主观 skill（写作风格、设计质量）更适合定性评估——别硬塞断言给需要人工判断的东西。

草拟好断言后更新 `eval_metadata.json` 和 `evals/evals.json`。还要向用户解释他们将在 viewer 里看到什么——定性输出和定量 benchmark 都要说明。

### Step 3：运行完成时记录耗时数据

每个 subagent 任务完成时你会收到一条通知，里面有 `total_tokens` 和 `duration_ms`。**立刻**把这些数据存到对应 run 目录的 `timing.json`：

```json
{
  "total_tokens": 84852,
  "duration_ms": 23332,
  "total_duration_seconds": 23.3
}
```

这是唯一的捕获机会——它通过任务通知传过来，没有其它地方持久化。每条通知到达就处理，别想攒一批。

### Step 4：评分、聚合、起 viewer

所有 run 都跑完后：

1. **给每个 run 评分** —— spawn 一个 grader subagent（或在主线评分），读 `agents/grader.md`，把每条断言跟输出对照。结果存到每个 run 目录的 `grading.json`。grading.json 里 `expectations` 数组必须用字段 `text`、`passed`、`evidence`（**不**是 `name`/`met`/`details` 等其它写法）——viewer 依赖这些精确字段名。对能程序化检查的断言，写脚本跑而不是肉眼判断——脚本更快、更可靠、能跨迭代复用。

2. **聚合成 benchmark** —— 从 skill-creator 目录跑聚合脚本：

   ```bash
   python -m scripts.aggregate_benchmark <workspace>/iteration-N --skill-name <name>
   ```

   产出 `benchmark.json` 和 `benchmark.md`，每个配置的 pass_rate、time、tokens，带 mean ± stddev 和 delta。如果要手动生成 benchmark.json，schema 见 `references/schemas.md`。
   每个 with_skill 版本放在它对应 baseline 之前。

3. **做一次分析师 pass** —— 读 benchmark 数据，浮出聚合统计可能掩盖的模式。看什么见 `agents/analyzer.md`（"Analyzing Benchmark Results" 一节）——比如"无论有没有 skill 都通过的断言"（无区分性）、高方差 eval（可能不稳定）、时间/token 权衡。

4. **起 viewer**，定性输出和定量数据都给：

   ```bash
   nohup python <skill-creator-path>/eval-viewer/generate_review.py \
     <workspace>/iteration-N \
     --skill-name "my-skill" \
     --benchmark <workspace>/iteration-N/benchmark.json \
     > /dev/null 2>&1 &
   VIEWER_PID=$!
   ```

   迭代 2+ 还要带 `--previous-workspace <workspace>/iteration-<N-1>`。

   **Cowork / 无头环境**：如果没有 `webbrowser.open()` 或环境无显示，用 `--static <output_path>` 写一份独立 HTML 文件而不是起服务器。用户点 "Submit All Reviews" 时反馈会下载成 `feedback.json` 文件。下载后把 `feedback.json` 复制到 workspace 目录给下次迭代取用。

   注意：viewer 请用 generate_review.py 生成；不需要自己写 HTML。

5. **告诉用户**类似这样的话："结果已在浏览器打开。有两个 tab——'Outputs' 让你逐个点开测试 case 留反馈，'Benchmark' 显示定量对比。看完回到这边告诉我一声。"

### 用户在 viewer 里看到什么

"Outputs" tab 一次显示一个测试 case：

- **Prompt**：给定的任务
- **Output**：skill 产生的文件，能内联渲染就内联渲染
- **Previous Output**（迭代 2+）：折叠区，显示上次迭代的输出
- **Formal Grades**（如果跑了评分）：折叠区，显示每条断言通过/失败
- **Feedback**：文本框，输入时自动保存
- **Previous Feedback**（迭代 2+）：上次的评论，显示在文本框下面

"Benchmark" tab 显示统计摘要：每个配置的通过率、耗时、token 用量，按 eval 拆分加上分析师观察。

通过 prev/next 按钮或方向键导航。完事点 "Submit All Reviews"，所有反馈存到 `feedback.json`。

### Step 5：读反馈

用户说"看完了"后读 `feedback.json`：

```json
{
  "reviews": [
    {
      "run_id": "eval-0-with_skill",
      "feedback": "图表少了轴标签",
      "timestamp": "..."
    },
    { "run_id": "eval-1-with_skill", "feedback": "", "timestamp": "..." },
    { "run_id": "eval-2-with_skill", "feedback": "完美，喜欢这个", "timestamp": "..." }
  ],
  "status": "complete"
}
```

反馈为空意味着用户觉得没问题。重点改用户有具体抱怨的那几个测试 case。

用完 viewer 把它的进程杀掉：

```bash
kill $VIEWER_PID 2>/dev/null
```

---

## 改进 skill

这是循环的核心。你跑了测试 case、用户 review 了结果、现在要根据他们的反馈让 skill 变好。

### 怎么思考改进

1. **从反馈中泛化。** 大局观：我们在做的是能被用百万次（也许真是字面意义的百万次，谁知道）跨各种 prompt 用的 skill。你和用户在这里反复迭代少数几个例子是因为这样移动得快——用户对这些例子门儿清，他们评估新输出也快。但如果你们一起打磨出来的 skill 只对这几个例子管用，它就**没用**。与其堆零碎过拟合的修改、压迫式的 MUST，遇到顽固问题不妨**换条路**——换个比喻，或者推荐另一种工作方式。试错成本不高，也许就撞出好东西。

2. **保持 prompt 精简。** 没在干活的内容删掉。不仅看最终输出，还要**读 transcript**——如果 skill 让 model 浪费时间在无用的事情上，把那部分删了试试看。

3. **解释"为什么"。** 拼了命去解释每条要求背后的**为什么**。今天的 LLM 是**聪明**的——有不错的 theory of mind，给个好框架就能超越死板指令真的把事做成。即使用户的反馈很短或带情绪，也要真正去理解任务、为什么他们这么写、他们实际写了什么，然后把这种理解传到指令里。如果你发现自己在大写写 ALWAYS 或 NEVER，或者用超刚性的结构，这就是黄灯——尽量重新组织、解释道理，让 model 理解你为什么这么要求。这是更人性、更强大、更有效的方式。

4. **找跨测试 case 的重复工作。** 读测试运行的 transcript，留意 subagent 是不是各自独立写了相似的辅助脚本或对同一件事做了同样的多步处理。如果 3 个测试 case 都让 subagent 写了 `create_docx.py` 或 `build_chart.py`，这是个强信号——这个脚本该捆进 skill。写一次，放进 `scripts/`，让 skill 调用。这样以后每次调用都不用重复造轮子。

这件事很重要（我们试图创造每年数十亿美元的经济价值！），你的思考时间不是瓶颈；慢慢想透。建议先写一版草稿改稿，再用新鲜眼光重看改进。尽你所能进入用户的脑子，理解他们想要和需要什么。

### 迭代循环

改完 skill 后：

1. 把改动应用到 skill 上
2. 把所有测试 case 重新跑进新的 `iteration-<N+1>/` 目录，包括 baseline。如果在做新 skill，baseline 永远是 `without_skill`（不带 skill）——这个跨迭代不变。如果在改进现有 skill，自己判断 baseline 合适用哪个：用户最初带来的原版本，或上一轮迭代的版本
3. 启动 reviewer，带 `--previous-workspace` 指向上一轮
4. 等用户 review 完告诉你
5. 读新反馈，再改，再迭代

直到下列任一发生：

- 用户说他满意了
- 反馈全部为空（都看着不错）
- 你没有在做实质性进步

---

## 进阶：盲测对比

当你想更严格地对比两版 skill（例如用户问"新版到底有没有变好？"），有一套盲测对比系统。细节看 `agents/comparator.md` 和 `agents/analyzer.md`。基本思路：把两份输出给一个独立的 agent，**不告诉它哪份是哪个**，让它判断质量。然后分析为啥获胜的赢了。

可选项，需要 subagent，大多数用户不需要。人工 review 循环通常已经够用。

---

## Description 优化

SKILL.md frontmatter 里的 description 字段是决定 Claude 是否触发 skill 的主要机制。创建或改进 skill 后，主动提议优化 description 以提升触发准确率。

### Step 1：生成触发 eval 查询

做 20 条 eval 查询——should-trigger 和 should-not-trigger 混合。存成 JSON：

```json
[
  { "query": "用户 prompt", "should_trigger": true },
  { "query": "另一条 prompt", "should_trigger": false }
]
```

查询必须**真实**——Claude Code 或 Claude.ai 用户实际会输入的话。不是抽象请求，而是具体、细节丰富的请求。比如文件路径、用户的工作/处境背景、列名和取值、公司名、URL，一点点背景故事。可以小写、有缩写、有错别字或口语。长度混合，**重点放在边界 case 上**而不是非黑即白的（用户后面会签字确认）。

差：`"Format this data"`、`"Extract text from PDF"`、`"Create a chart"`

好：`"我老板刚发我这个 xlsx 文件（在我下载里，叫啥 'Q4 sales final FINAL v2.xlsx' 来着），她要我加一列显示利润率百分比。收入应该在 C 列，成本在 D 列吧"`

**should-trigger** 查询（8-10 条）要考虑覆盖度。要同一意图的不同表达——有些正式、有些随意。包括用户没明说 skill 名字或文件类型但显然需要它的 case。塞一些不常见用法、跟其它 skill 竞争但本 skill 该赢的 case。

**should-not-trigger** 查询（8-10 条）最有价值的是**接近 miss**——跟 skill 共享关键词或概念但实际需要不同东西的查询。想相邻领域、措辞歧义（朴素关键词匹配会触发但实际不该）、查询触及到 skill 能做的事但场景里其它工具更合适的情况。

要避免的关键问题：别让 should-not-trigger 查询**明显不相关**。"写一个 fibonacci 函数"作为 PDF skill 的负例**太容易**了——什么都没测。负例必须**真正有迷惑性**。

### Step 2：让用户 review

用 HTML 模板把 eval 集呈给用户 review：

1. 读模板 `assets/eval_review.html`
2. 替换占位符：
   - `__EVAL_DATA_PLACEHOLDER__` → eval 项的 JSON 数组（不要加引号——这是 JS 变量赋值）
   - `__SKILL_NAME_PLACEHOLDER__` → skill 名字
   - `__SKILL_DESCRIPTION_PLACEHOLDER__` → skill 当前的 description
3. 写到临时文件（如 `/tmp/eval_review_<skill-name>.html`）并打开：`open /tmp/eval_review_<skill-name>.html`
4. 用户可以编辑查询、切换 should-trigger、增删条目，然后点 "Export Eval Set"
5. 文件下载到 `~/Downloads/eval_set.json`——查 Downloads 里**最新版本**（可能有 `eval_set (1).json` 之类的多份）

这一步很重要——糟糕的 eval 查询会导致糟糕的 description。

### Step 3：跑优化循环

告诉用户："这要花一会儿——我会在后台跑优化循环，定时查进度。"

把 eval 集存到 workspace，然后后台跑：

```bash
python -m scripts.run_loop \
  --eval-set <path-to-trigger-eval.json> \
  --skill-path <path-to-skill> \
  --model <model-id-powering-this-session> \
  --max-iterations 5 \
  --verbose
```

`--model` 用你 system prompt 里的 model ID（当前会话用的那个），这样触发测试匹配用户实际体验。

跑期间定期 tail 输出，给用户更新当前迭代和分数情况。

这会自动处理完整优化循环。它把 eval 集分 60% 训练、40% 留出测试集，评估当前 description（每条查询跑 3 次取可靠的触发率），然后让 Claude 根据失败 case 提改进建议。它在训练集和测试集上重新评估每个新 description，最多迭代 5 次。完事后在浏览器打开 HTML 报告显示每轮迭代的结果，返回 JSON，里面 `best_description` 是按**测试**集分数选的（不是训练集，避免过拟合）。

### Skill 触发机制是怎么工作的

理解触发机制有助于设计更好的 eval 查询。Skill 出现在 Claude 的 `available_skills` 列表里，附带 name + description，Claude 基于 description 决定是否要查阅 skill。要点：**Claude 只在它自己不容易处理的任务上查阅 skill**——像"读这个 PDF"这种简单一步查询可能不会触发任何 skill 即便 description 完美匹配，因为 Claude 用基础工具就直接处理了。复杂、多步、专业的查询在 description 匹配时会可靠触发 skill。

这意味着你的 eval 查询要**有实质内容**，让 Claude 真的会受益于查阅 skill。"读文件 X" 这种简单查询是糟糕的测试 case——无论 description 多好都不会触发。

### Step 4：应用结果

从 JSON 输出里取 `best_description`，更新 skill 的 SKILL.md frontmatter。给用户看 before/after 并报告分数。

---

### 打包并呈现（仅当有 `present_files` 工具时）

检查你是否有 `present_files` 工具。**没有就跳过**。**有的话**，打包 skill 并把 .skill 文件呈给用户：

```bash
python -m scripts.package_skill <path/to/skill-folder>
```

打包后告诉用户产出的 `.skill` 文件路径，他们可以安装。

---

## Claude.ai 特定说明

在 Claude.ai 里，核心工作流相同（草稿 → 测试 → review → 改进 → 重复），但因为 Claude.ai 没 subagent，有些机制会变。要适配的：

**跑测试 case**：没 subagent 就没并行执行。每个测试 case 都自己读 skill 的 SKILL.md，然后跟着指令亲自完成测试 prompt。一次一个。这没独立 subagent 严格（你既写了 skill 又在跑它，上下文不独立），但作为 sanity check 仍然有用——人工 review 步骤会补偿。**跳过 baseline run**——就按要求用 skill 完成任务。

**review 结果**：如果没法开浏览器（如 Claude.ai 的 VM 无显示、或在远程服务器上），**完全跳过** browser reviewer。改成在对话里直接呈现结果。每个测试 case 显示 prompt 和输出。如果输出是用户要看的文件（如 .docx、.xlsx），存到文件系统并告诉他们路径，让他们下载查看。inline 问反馈："这看着怎么样？有什么想改的？"

**Benchmark**：跳过定量 benchmark——它依赖 baseline 对比，没 subagent 就没意义。专注于用户的定性反馈。

**迭代循环**：跟之前一样——改 skill、重跑测试 case、问反馈——只是中间没有 browser reviewer。如果有文件系统，仍然可以按迭代目录组织结果。

**Description 优化**：这部分要 `claude` CLI 工具（具体是 `claude -p`），只有 Claude Code 有。在 Claude.ai 跳过。

**盲测对比**：要 subagent。跳过。

**打包**：`package_skill.py` 在任何有 Python 和文件系统的地方都能跑。Claude.ai 上你可以跑它，用户下载产出的 `.skill` 文件。

**更新现有 skill**：用户可能是让你**更新**而不是新建一个 skill。这种情况：

- **保留原名字**。记下 skill 目录名和 `name` frontmatter 字段——保持不变。比如已装的 skill 叫 `research-helper`，输出 `research-helper.skill`（**不是** `research-helper-v2`）
- **编辑前先复制到可写位置**。已装 skill 路径可能只读。复制到 `/tmp/skill-name/` 在那里编辑，从副本打包
- **如果手动打包，先在 `/tmp/` 暂存**，然后复制到输出目录——直接写可能因权限失败

---

## Cowork 特定说明

如果你在 Cowork，主要要知道：

- 你有 subagent，所以主工作流（并行 spawn 测试 case、跑 baseline、评分等）都能跑。（不过如果你严重遇到超时问题，串行跑测试 prompt 也 OK。）
- 你**没有**浏览器或显示，生成 eval viewer 时用 `--static <output_path>` 写独立 HTML 而不是起服务器。然后给用户一个能点开 HTML 的链接。
- 不知为何，Cowork 设置似乎让 Claude 跑完测试**不**爱生成 eval viewer，所以**再强调一遍**：无论在 Cowork 还是 Claude Code，跑完测试**永远**要生成 eval viewer 让人类先看 case 再自己 review 试改 skill，**用 `generate_review.py`**（不要自己写定制 HTML）。抱歉这里要大写——**先生成 eval viewer**，再自己评估输入。要尽快把例子摆在人类面前！
- 反馈机制不同：因为没运行中的服务器，viewer 的 "Submit All Reviews" 按钮会把 `feedback.json` 下载成文件。你可以从那里读它（可能要先请求访问权限）
- 打包能用——`package_skill.py` 只需要 Python 和文件系统
- Description 优化（`run_loop.py` / `run_eval.py`）在 Cowork 应该能跑，因为它通过 subprocess 调 `claude -p`，不用浏览器，但**等到 skill 完全做完用户同意状态良好后再做**
- **更新现有 skill**：用户可能是让你更新而不是新建。按上面 claude.ai 一节的更新指南做

---

## Reference 文件

agents/ 目录是给专门 subagent 的指令。要 spawn 相关 subagent 时去读。

- `agents/grader.md` — 怎么把断言跟输出对照评估
- `agents/comparator.md` — 怎么做两份输出的盲 A/B 对比
- `agents/analyzer.md` — 怎么分析为啥一版赢过另一版

references/ 目录是额外文档：

- `references/schemas.md` — evals.json、grading.json 等的 JSON 结构

---

再强调一遍核心循环：

- 搞清楚 skill 是关于什么的
- 草拟或编辑 skill
- 让 claude-with-access-to-the-skill 跑测试 prompt
- 跟用户一起评估输出：
  - 创建 benchmark.json 并跑 `eval-viewer/generate_review.py` 帮用户 review
  - 跑定量评估
- 重复直到你和用户都满意
- 打包最终 skill 交付给用户

请把这些步骤加到 TodoList（如果你有的话），别忘了。如果在 Cowork，**专门**把 "创建 evals JSON 并跑 `eval-viewer/generate_review.py` 让人类 review 测试 case" 放进 TodoList，确保这一步发生。

祝好运！
