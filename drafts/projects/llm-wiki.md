---
title: LLM Wiki 知识库
summary: 把散落的论文与笔记整理成可检索的知识库，支持向量召回与引用回溯。
tech: [Python, FastAPI, RAG, Vue3]
price:
  type: free
order: 10
---

> **这是示例项目**，用来演示项目卡片的排版与详情页的 markdown 渲染。
> 请把 `drafts/projects/` 下的示例文件替换成你自己的项目介绍。

## 项目简介

LLM Wiki 的目标是把平时读过的论文、写过的笔记统一收进一个知识库，
既能按关键词检索，也能用自然语言提问，并且每条回答都带原文出处。

## 核心能力

| 能力 | 说明 | 状态 |
| --- | --- | --- |
| 文档解析 | 支持 PDF、Markdown、HTML | 已完成 |
| 向量召回 | 支持混合检索（稠密 + 稀疏） | 已完成 |
| 引用回溯 | 回答附带原文片段与页码 | 进行中 |
| 多轮对话 | 基于历史上下文的追问 | 规划中 |

## 技术要点

检索质量的关键在于切分策略。常用的做法是按语义边界切分，
并让相邻块之间保留一部分重叠，避免答案被切断在块边界上。

设文档块集合为 $\{c_1, c_2, \dots, c_n\}$，查询 $q$ 的相似度为：

$$
\mathrm{score}(q, c_i) = \frac{\mathbf{e}_q \cdot \mathbf{e}_{c_i}}{\lVert \mathbf{e}_q \rVert \, \lVert \mathbf{e}_{c_i} \rVert}
$$

按得分取前 $k$ 个块作为上下文。

## 目录结构

```text
llm-wiki/
├── app/
│   ├── api/          # FastAPI 路由
│   ├── retrieval/    # 检索与重排
│   └── ingest/       # 文档解析与切分
└── web/              # Vue3 前端
```

## 快速开始

```bash
git clone https://github.com/your-name/llm-wiki.git
cd llm-wiki && pip install -r requirements.txt
uvicorn app.main:app --reload
```

![处理流程示例](/images/placeholder-diagram.svg)
