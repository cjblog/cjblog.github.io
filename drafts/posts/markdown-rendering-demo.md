---
title: Markdown 渲染效果演示
date: 2026-09-01
tags: [Markdown, KaTeX, 排版]
pinned: true
---

> **这是示例文章**，用来演示公式、表格、图片、代码块的渲染效果。
> 请把 `drafts/posts/` 下的示例文件替换成你自己的文章。

这篇文章把所有需要正确渲染的元素都放了一遍，方便一眼看出样式有没有问题。

## 行内与行间公式

行内公式写在两个美元符号之间，例如质能方程 $E = mc^2$，
以及欧拉恒等式 $e^{i\pi} + 1 = 0$，它们会随文字一起排版，不会另起一行。

行间公式独立成行并居中：

$$
\int_{0}^{\infty} e^{-x^{2}} \, \mathrm{d}x = \frac{\sqrt{\pi}}{2}
$$

麦克斯韦方程组之一，高斯定律的微分形式：

$$
\nabla \cdot \mathbf{E} = \frac{\rho}{\varepsilon_{0}}
$$

薛定谔方程（含时形式）：

$$
i\hbar \frac{\partial}{\partial t} \Psi(\mathbf{r}, t) = \hat{H} \Psi(\mathbf{r}, t)
$$

## 表格

| 渲染元素 | 语法 | 是否支持 |
| --- | --- | :---: |
| 行内公式 | `$x^2$` | 是 |
| 行间公式 | `$$...$$` | 是 |
| GFM 表格 | `\| a \| b \|` | 是 |
| 代码高亮 | 三反引号 | 是 |
| 任务列表 | `- [x]` | 是 |

对齐方式由分隔行里的冒号控制，上表第三列是居中对齐。

## 列表

无序列表：

- 第一项
- 第二项
  - 嵌套的子项
  - 另一个子项

有序列表：

1. 先写草稿
2. 跑一遍 `npm run sync`
3. 本地预览确认效果

任务列表：

- [x] 支持公式渲染
- [x] 支持表格
- [ ] 支持脚注

## 代码块

带语法高亮的 Python 代码：

```python
from math import sqrt

def normal_pdf(x: float, mu: float = 0.0, sigma: float = 1.0) -> float:
    """标准正态分布的概率密度函数。"""
    coefficient = 1.0 / (sigma * sqrt(2 * 3.141592653589793))
    exponent = -((x - mu) ** 2) / (2 * sigma ** 2)
    return coefficient * pow(2.718281828459045, exponent)
```

行内代码 `npm run build` 会显示为等宽字体。

## 图片

本地图片用站内路径引用（不要用绝对 URL，否则本地预览会去线上取图）：

![示例插图](/images/placeholder-diagram.svg)

## 引用与分割线

> 引用块用来强调某段话。
> 可以跨多行。

---

以上就是全部需要验证渲染的元素。
