"""
🐉 小龙人PSPAI DNA双螺旋引擎 v7.0
==================================
活的可变异基因系统。基因→测序→合成→进化，四步生命周期。

## 基因进化计划（5阶路线）

第1阶 ✅ 基因基础（17基因已注册）
  碱基A（Tool）：shell_exec, git_operations, sql_query, csv_read, 
                excel_read, pdf_extract, self_heal, tool_doctor,
                decision_why, pattern_match, search_log,
                workflow_decompose, ssh_exec, brother_watch,
                ai_search, knowledge_query, self_check_gaps

第2阶 🚧 自主规划基因（NPC2：Neural Planning Cortex）
  task_decomposer T → 复杂任务自动拆解为有序子任务
  step_executor   T → 按序列逐一执行，每步可调工具
  self_corrector  T → 某步失败时自动分析根因+重试/换方案
  progress_tracker T → 多步执行进度追踪与结果汇总

第3阶 🚧 代码闭环基因（CDG3：Code Development Gene）
  file_read_think  A → 读文件→理解结构→分析修改意图
  file_edit_patch  A → 精确修改文件（非全量重写）
  code_verify      A → 语法检查+测试运行验证
  git_commit_pr    A → 修改完成后自动commit+提PR

第4阶 🚧 记忆进化基因（MEG4：Memory Evolution Gene）
  user_profile         T → 从对话提取偏好/习惯/重要事实
  memory_retrieval     T → 语义检索历史对话
  knowledge_accumulate T → 跨会话知识聚合为学识
  cross_session        T → 下次打开保持记忆连续性

第5阶 🌱 AI原生能力基因（AIG5：AI Generative Gene）
  vision_analyze  C → 图片识别分析（多模态API）
  speech_in       C → 语音输入识别（STT API）
  speech_out      C → 语音合成输出（TTS API）
  image_gen       C → 图像生成
  plugin_system   C → 第三方插件可注册为新基因

第6阶 🔄 Loop闭环基因（LCG6：Loop Closure Gene）
  event_listener   G → 监听事件源（文件变化/进程变化/条件阈值）
  task_scheduler   G → 自主调度器：事件→决策→启动Worker
  worker_exec      A → 纯执行：写文件/改配置/查服务，不判断好坏
  reviewer_verify  G → 独立验收：存在性/内容/功能/副作用四检
  human_escalate   G → 三阶失败后升级到人类

## 竞品对比（小龙人 = 独有优势）

竞品      架构类型     DNA兼容性    本地运行    自进化
──────    ──────      ─────────    ──────      ─────
ChatGPT   云端Agent    ❌ 不能       ❌ 云端     ❌
ClaudeCode CLI工具链   ❌ 仅代码     ✅ 可本地   ❌
Cursor    IDE编辑器    ❌ 绑编辑器   ✅ 可本地   ❌
Devin     云端IDE     ❌ 不能       ❌ 云端     ❌
小龙人🏆  DNA生命体   💎 原生      🏆 纯本地   💎 基因进化
"""
import json
import time
import hashlib
import random
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple


# ══════════════════════════════════════════════
# 第1层：碱基定义（A/T/C/G 四碱基）
# ══════════════════════════════════════════════

class Base:
    """最小的能力单元（碱基）"""
    A = "tool"       # 工具（git_operations, sql_query等）
    T = "skill"      # 技能（记忆管理、自检等）
    C = "plugin"     # 插件（搜索、传感器、媒体等）
    G = "card"       # 声明/元数据（Agent Card, 配置声明）


class Gene:
    """
    基因片段 = 碱基 + 具体能力 + 接口描述。
    等价于 TOOL_REGISTRY 中的一条记录。
    """
    def __init__(self, name: str, base_type: str, description: str,
                 parameters: dict, handler: callable):
        self.name = name
        self.base_type = base_type      # A/T/C/G
        self.description = description
        self.parameters = parameters    # JSON Schema
        self.handler = handler
        self.fitness = 0.0              # 适应度（成功率）
        self.call_count = 0
        self.success_count = 0
        self.gene_id = hashlib.md5(f"{name}:{base_type}".encode()).hexdigest()[:12]

    def record_call(self, success: bool):
        """记录一次调用结果，更新适应度"""
        self.call_count += 1
        if success:
            self.success_count += 1
        self.fitness = self.success_count / max(self.call_count, 1)

    def to_dict(self) -> dict:
        return {
            "gene_id": self.gene_id,
            "name": self.name,
            "base_type": self.base_type,
            "description": self.description,
            "parameters": self.parameters,
            "fitness": round(self.fitness, 3),
            "call_count": self.call_count,
        }


# ══════════════════════════════════════════════
# 第2层：双螺旋结构（DNA双链）
# ══════════════════════════════════════════════

class GeneSequence:
    """
    基因序列 = 一次任务对应的工具调用序列。
    等价于「LLM决定先调用A工具再调用B工具」的有序列表。

    双螺旋结构：
    螺旋1（Intent Chain）: 用户的意图/上下文序列
    螺旋2（Tool Chain）:  对应的工具调用序列
    """
    def __init__(self, task_id: str = ""):
        self.task_id = task_id or f"task_{int(time.time())}"
        self.intent_chain: List[str] = []    # 螺旋1：意图链
        self.tool_chain: List[str] = []      # 螺旋2：工具链
        self.params_chain: List[dict] = []   # 对应参数
        self.results: List[dict] = []        # 执行结果
        self.success = False
        self.start_time = time.time()
        self.end_time = 0.0

    def add_step(self, intent: str, tool_name: str, params: dict = None):
        """添加一对意图→工具"""
        self.intent_chain.append(intent)
        self.tool_chain.append(tool_name)
        self.params_chain.append(params or {})

    def record_result(self, index: int, success: bool, output: str):
        """记录某一步的执行结果"""
        self.results.append({
            "step": index,
            "tool": self.tool_chain[index] if index < len(self.tool_chain) else "unknown",
            "success": success,
            "output": output[:200],
        })

    def complete(self, success: bool):
        """标记序列执行完毕"""
        self.success = success
        self.end_time = time.time()

    def to_dna(self) -> str:
        """将基因序列编码为DNA字符串（ATCG表示）"""
        # 简单编码：工具名hash取前8位hex → 映射到ATCG
        dna_parts = []
        for t in self.tool_chain:
            h = hashlib.md5(t.encode()).hexdigest()[:8]
            # hex char → A/T/C/G 映射（0-9→A/T, a-f→C/G）
            dna = "".join("A" if c in "01234" else "T" if c in "56789" else "C" if c in "abcde" else "G" for c in h)
            dna_parts.append(dna)
        return "-".join(dna_parts)

    def to_dict(self) -> dict:
        return {
            "task_id": self.task_id,
            "dna": self.to_dna(),
            "intent_chain": self.intent_chain,
            "tool_chain": self.tool_chain,
            "success": self.success,
            "duration": round(self.end_time - self.start_time, 2) if self.end_time else 0,
            "results": self.results,
        }


class DNARegistry:
    """
    基因注册中心。管理所有可用的基因片段。
    等同于 TOOL_REGISTRY + 进化数据。
    """
    def __init__(self):
        self.genes: Dict[str, Gene] = {}
        self.evolution_log_path = Path(__file__).parent / "data" / "dna_evolution.json"

    def register_gene(self, gene: Gene):
        """注册一个基因片段"""
        self.genes[gene.name] = gene

    def register_from_tool_registry(self, registry: dict):
        """从pspai_server的TOOL_REGISTRY批量导入基因"""
        for name, tool in registry.items():
            gene = Gene(
                name=name,
                base_type=Base.A,  # 工具默认=A碱基
                description=tool.get("description", ""),
                parameters=tool.get("parameters", {}),
                handler=tool.get("handler"),
            )
            self.register_gene(gene)

    def get_gene(self, name: str) -> Optional[Gene]:
        return self.genes.get(name)

    def get_all_genes(self) -> List[Gene]:
        return list(self.genes.values())

    def save_evolution(self, sequence: GeneSequence):
        """保存一次进化记录"""
        records = []
        if self.evolution_log_path.exists():
            try:
                records = json.loads(self.evolution_log_path.read_text())
            except:
                records = []
        records.append(sequence.to_dict())
        # 只保留最近500条
        if len(records) > 500:
            records = records[-500:]
        self.evolution_log_path.parent.mkdir(exist_ok=True)
        self.evolution_log_path.write_text(
            json.dumps(records, ensure_ascii=False, indent=2)
        )

    def get_fittest_genes(self, top_n: int = 5) -> List[Gene]:
        """获取适应度最高的基因"""
        return sorted(self.genes.values(), key=lambda g: g.fitness, reverse=True)[:top_n]

    def get_weakest_genes(self, top_n: int = 5) -> List[Gene]:
        """获取适应度最低且调用过的基因"""
        called = [g for g in self.genes.values() if g.call_count > 0]
        return sorted(called, key=lambda g: g.fitness)[:top_n]

    def extract_dna(self) -> dict:
        """
        基因提取：导出当前基因组为可移植JSON。
        等价于ClawDNA的「提取DNA→克隆安装」。
        """
        return {
            "version": "1.0",
            "extracted_at": time.time(),
            "gene_count": len(self.genes),
            "genes": [g.to_dict() for g in self.genes.values()],
            "fittest": [g.name for g in self.get_fittest_genes(3)],
        }


# ══════════════════════════════════════════════
# 第3层：变异机制（进化与自适应）
# ══════════════════════════════════════════════

class GeneMutator:
    """
    基因变异器。失败时自动尝试不同工具组合。

    实现思路：
    1. Gene Sequencer输出的工具序列执行失败
    2. 变异器分析失败原因（工具返回error/超时/空结果）
    3. 尝试替换其中一个基因片段为功能相似的工具
    4. 新的组合记录为一次「变异尝试」
    5. 成功则保存为新模板，失败则回退
    """
    def __init__(self, registry: DNARegistry):
        self.registry = registry
        # 工具相似性映射：某个工具失败时，用什么替代
        self.fallback_map = {
            "ai_search": ["web_search", "knowledge_query"],
            "knowledge_query": ["ai_search"],
            "ssh_exec": ["brother_watch"],
            "sql_query": ["csv_read"],
            "csv_read": ["excel_read"],
            "excel_read": ["csv_read"],
            "pdf_extract": ["csv_read"],
        }

    def mutate(self, failed_sequence: GeneSequence) -> Optional[GeneSequence]:
        """
        对失败的基因序列执行变异。
        返回一个新的变异序列，或None表示无法变异。
        """
        if not failed_sequence.tool_chain:
            return None

        # 找到失败的那一步
        failed_step = None
        for i, r in enumerate(failed_sequence.results):
            if not r.get("success", True):
                failed_step = i
                break

        if failed_step is None:
            # 所有步骤都成功了但整体失败 → 换组合
            failed_step = len(failed_sequence.tool_chain) - 1

        failed_tool = failed_sequence.tool_chain[failed_step]
        alternatives = self.fallback_map.get(failed_tool, [])

        for alt in alternatives:
            if alt in self.registry.genes:
                # 生成变异序列
                new_seq = GeneSequence(task_id=f"mutant_{int(time.time())}")
                for i, intent in enumerate(failed_sequence.intent_chain):
                    tool = failed_sequence.tool_chain[i] if i != failed_step else alt
                    params = failed_sequence.params_chain[i] if i < len(failed_sequence.params_chain) else {}
                    new_seq.add_step(intent, tool, params)
                return new_seq

        return None

    def crossover(self, seq_a: GeneSequence, seq_b: GeneSequence) -> GeneSequence:
        """
        双亲DNA重组：取序列A的前半段 + 序列B的后半段
        生成后代基因序列。
        """
        mid_a = len(seq_a.tool_chain) // 2
        mid_b = len(seq_b.tool_chain) // 2

        child = GeneSequence(task_id=f"child_{int(time.time())}")

        # 前半段来自父A
        for i in range(mid_a):
            intent = seq_a.intent_chain[i] if i < len(seq_a.intent_chain) else f"step_{i}"
            child.add_step(intent, seq_a.tool_chain[i])

        # 后半段来自父B
        for i in range(mid_b, len(seq_b.tool_chain)):
            intent = seq_b.intent_chain[i] if i < len(seq_b.intent_chain) else f"step_{i}"
            child.add_step(intent, seq_b.tool_chain[i])

        return child


# ══════════════════════════════════════════════
# 第4层：进化引擎（主控循环）
# ══════════════════════════════════════════════

class EvolutionEngine:
    """
    进化引擎。小龙人DNA系统的核心循环。

    每次工具调用时：
    1. 记录本次调用的基因序列
    2. 如果失败 → 触发变异（mutate）
    3. 如果成功 → 存档为模板
    4. 定期评估基因适应度，淘汰弱基因
    """
    def __init__(self, registry: DNARegistry):
        self.registry = registry
        self.mutator = GeneMutator(registry)
        self.current_sequence: Optional[GeneSequence] = None
        self.mutation_count = 0
        self.successful_templates: List[GeneSequence] = []

    def start_task(self, task_id: str = "") -> GeneSequence:
        """开始一个新任务，初始化基因序列"""
        self.current_sequence = GeneSequence(task_id=task_id)
        return self.current_sequence

    def add_intent_tool_pair(self, intent: str, tool_name: str, params: dict = None):
        """添加一对意图→工具"""
        if self.current_sequence:
            self.current_sequence.add_step(intent, tool_name, params)

    def record_tool_result(self, tool_name: str, success: bool, output: str = ""):
        """记录工具执行结果并更新基因适应度"""
        gene = self.registry.get_gene(tool_name)
        if gene:
            gene.record_call(success)

        if self.current_sequence:
            step_idx = len(self.current_sequence.results)
            self.current_sequence.record_result(step_idx, success, output)

    def finish_task(self, success: bool) -> Optional[GeneSequence]:
        """结束当前任务，触发进化逻辑"""
        if not self.current_sequence:
            return None

        seq = self.current_sequence
        seq.complete(success)

        if success:
            # 成功：存档为模板
            self.successful_templates.append(seq)
            if len(self.successful_templates) > 100:
                self.successful_templates = self.successful_templates[-100:]
        else:
            # 失败：尝试变异
            mutated = self.mutator.mutate(seq)
            if mutated:
                self.mutation_count += 1
                self.registry.save_evolution(seq)  # 保存失败记录
                return mutated  # 返回变异序列供重新执行

        # 保存进化记录
        self.registry.save_evolution(seq)
        self.current_sequence = None
        return None

    def get_status(self) -> dict:
        """返回进化引擎状态"""
        return {
            "genes": len(self.registry.genes),
            "mutations": self.mutation_count,
            "templates": len(self.successful_templates),
            "fittest": [g.name for g in self.registry.get_fittest_genes(3)],
            "weakest": [g.name for g in self.registry.get_weakest_genes(3)],
        }

    def extract_genome(self) -> dict:
        """导出完整基因组（可移植给另一台机器）"""
        return self.registry.extract_dna()


# ══════════════════════════════════════════════
# 工厂函数：从TOOL_REGISTRY初始化DNA系统
# ══════════════════════════════════════════════

def init_dna_system(tool_registry: dict) -> EvolutionEngine:
    """
    从现有的TOOL_REGISTRY初始化DNA系统。
    这是小龙人PSPAI集成DNA架构的入口。
    
    用法：
        from pspai_dna import init_dna_system
        evo = init_dna_system(TOOL_REGISTRY)
        evo.get_status()  # 查看进化状态
    """
    registry = DNARegistry()
    registry.register_from_tool_registry(tool_registry)

    # 尝试加载历史进化记录
    if registry.evolution_log_path.exists():
        try:
            records = json.loads(registry.evolution_log_path.read_text())
            # 从历史记录恢复基因适应度
            for record in records[-100:]:  # 只看最近100条
                for result in record.get("results", []):
                    gene = registry.get_gene(result.get("tool", ""))
                    if gene:
                        gene.record_call(result.get("success", False))
        except:
            pass

    return EvolutionEngine(registry)
