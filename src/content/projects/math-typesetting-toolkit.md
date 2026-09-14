---
title: 数学排版工具集
summary: 把 Markdown 里的 LaTeX 公式排版成印刷级效果，支持导出 PDF 与静态站点。
tech:
  - TypeScript
  - KaTeX
  - Astro
  - Node.js
price:
  type: paid
  amount: 99
order: 30
cover: /images/placeholder-cover.svg
---

> **这是示例项目**，用来演示「付费:xx元」价格标签的紫色样式与卡片封面图。
> 请替换成你自己的项目介绍。

## 简介

写技术文章时，公式排版一直是个麻烦事：截图不清晰，手写 LaTeX 又容易出错。
这套工具集让你在 Markdown 里直接写 LaTeX，构建时自动排版成印刷级效果。

## 功能

| 功能 | 说明 |
| --- | --- |
| 行内公式 | 用 `$...$` 书写，随文排版 |
| 行间公式 | 用 `$$...$$` 书写，居中独立成行 |
| 编号与引用 | 支持给公式编号并在正文中引用 |
| 多格式导出 | 静态站点、PDF、EPUB |

## 排版质量

公式排版的核心是间距规则。以积分号为例，上下限的位置由字号与
积分号的视觉重心共同决定：

$$
\int_{0}^{\infty} e^{-x^{2}} \, \mathrm{d}x = \frac{\sqrt{\pi}}{2}
$$

矩阵与多行公式同样支持：

$$
\mathbf{A} =
\begin{pmatrix}
a_{11} & a_{12} & \cdots & a_{1n} \\
a_{21} & a_{22} & \cdots & a_{2n} \\
\vdots & \vdots & \ddots & \vdots \\
a_{m1} & a_{m2} & \cdots & a_{mn}
\end{pmatrix}
$$

## 使用方式

```bash
npm install math-typesetting-toolkit
npx mtt build ./docs --out ./dist
```

## 授权说明

个人使用授权 99 元，含一年更新。商用请单独联系。
