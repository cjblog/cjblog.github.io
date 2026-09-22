---
title: 注意力机制与掩码注意力详解(附带例子说明)
date: '2026-08-20'
updated: '2026-09-22'
tags:
  - 深度学习
  - Transformer
  - 注意力
---

注意力机制的公式只有一行，但「读懂公式」和「把每个数字算出来」是两回事。这篇文章拿一个四个 token 的句子，把 Q、K、V 的每一个分量、每一次内积、每一次 softmax 都算一遍——小到每个格子里的数都能手算核对——然后在同一组数上接着讲掩码注意力。

<!-- more -->

## 算例：一句话，四个 token

后面所有图、所有表，用的都是这一个例子：

| 位置 $i$ | token | 在这里的角色 |
| --- | --- | --- |
| 0 | 我 | 主语 |
| 1 | 爱 | 动词 |
| 2 | 吃 | 动词 |
| 3 | 苹果 | 宾语 |

真实模型里 token 是子词，一句话会被切成十几个甚至几十个 token。这里刻意用四个单字 token，是为了让每个中间结果都能在一屏里排下，而且能手算核对。**结构上它和真实模型完全一样，只是小到可以逐个数字盯着看。**

## 记号与形状

| 记号 | 是什么 | 本例形状 | 一句话含义 |
| --- | --- | --- | --- |
| $n$ | token 数 | 4 | 序列长度，决定注意力矩阵是几阶方阵 |
| $d_k$ | Q / K 的每个头的维度 | 4 | 决定缩放因子 $\sqrt{d_k}$ |
| $d_v$ | V 的每个头的维度 | 3 | **决定输出的宽度** |
| $Q$ | 查询矩阵，每行一个 token | $4 \times 4$ | 这个 token「我在找什么」 |
| $K$ | 键矩阵，每行一个 token | $4 \times 4$ | 这个 token「我是什么」 |
| $V$ | 值矩阵，每行一个 token | $4 \times 3$ | 这个 token「我能给出什么」 |

注意 $d_k$ 和 $d_v$ 是两个可以不相等的量：注意力矩阵 $A$ 是 $n \times n$ 的，而输出 $AV$ 的形状是 $n \times d_v$。**输出的宽度由 V 决定，与 Q、K 无关。** 本例里 $d_k = 4$、$d_v = 3$，就是为了让这件事在图上看得出来。

## Q、K、V 从哪来

标准流程是先把每个 token 的 embedding 拼成 $X \in \mathbb{R}^{n \times d_{\text{model}}}$，再用三个可学的投影矩阵投影出三份表示：

$$
Q = XW^Q,\qquad K = XW^K,\qquad V = XW^V
$$

这三步都是普通的矩阵乘法，不涉及注意力机制本身。**本文直接从投影之后开始**，把 Q、K、V 当作给定输入——因为注意力真正做的事情，全在它们之后的四步里。

下面这三个矩阵是为了能手算而手工设定的（取值都是 $-1$ 到 $2$ 的小整数），**不代表真实模型学到了什么**。你要看的是计算过程，不是这几个数的语义。

$$
Q=\begin{bmatrix}
1 & 1 & 1 & -1\\
0 & 1 & 0 & 1\\
0 & 0 & 1 & -1\\
1 & 0 & 0 & 2
\end{bmatrix}
\qquad
K=\begin{bmatrix}
0 & -1 & -1 & -1\\
0 & 1 & 0 & 2\\
1 & 0 & 1 & 2\\
1 & 1 & 1 & -1
\end{bmatrix}
\qquad
V=\begin{bmatrix}
2 & 0 & 1\\
0 & 1 & 0\\
1 & 0 & 2\\
0 & 2 & 1
\end{bmatrix}
$$

行序和 token 顺序一致：第 0 行是「我」，第 3 行是「苹果」。

## 全貌：四步

先看一眼整个流程，再逐步展开。每一步旁边的形状是这一步的产出：

<div class="diagram-scroll">
<svg width="640" height="190" viewBox="0 0 640 190" role="img" aria-label="注意力计算流程：打分、缩放、归一化、加权求和四步，以及各步的输出形状">
  <g font-size="11" fill="var(--ink-faint)" text-anchor="middle">
    <text x="60" y="18">输入</text>
    <text x="188" y="18">第 1 步</text>
    <text x="316" y="18">第 2 步</text>
    <text x="444" y="18">第 3 步</text>
    <text x="572" y="18">第 4 步</text>
  </g>
  <g stroke="var(--line-strong)" fill="var(--surface)">
    <rect x="14" y="26" width="92" height="62" rx="8"/>
    <rect x="142" y="26" width="92" height="62" rx="8"/>
    <rect x="270" y="26" width="92" height="62" rx="8"/>
    <rect x="398" y="26" width="92" height="62" rx="8"/>
    <rect x="526" y="26" width="92" height="62" rx="8"/>
    <rect x="526" y="136" width="92" height="42" rx="8"/>
  </g>
  <g font-size="13" font-weight="600" fill="var(--ink)" text-anchor="middle">
    <text x="60" y="44">Q K V</text>
    <text x="188" y="44">打分</text>
    <text x="316" y="44">缩放</text>
    <text x="444" y="44">归一化</text>
    <text x="572" y="44">加权求和</text>
  </g>
  <g font-size="10.5" fill="var(--ink-muted)" text-anchor="middle">
    <text x="60" y="62">查询 键 值</text>
    <text x="188" y="62">S = QK<tspan baseline-shift="super" font-size="8">T</tspan></text>
    <text x="316" y="62">S / √d_k</text>
    <text x="444" y="62">A = softmax(S)</text>
    <text x="572" y="62">O = A V</text>
  </g>
  <g font-size="10" fill="var(--ink-faint)" text-anchor="middle">
    <text x="60" y="78">4×4 4×4 4×3</text>
    <text x="188" y="78">4×4</text>
    <text x="316" y="78">4×4</text>
    <text x="444" y="78">4×4</text>
    <text x="572" y="78">4×3</text>
  </g>
  <g stroke="var(--ink-faint)" stroke-width="1">
    <line x1="106" y1="57" x2="136" y2="57"/>
    <line x1="234" y1="57" x2="264" y2="57"/>
    <line x1="362" y1="57" x2="392" y2="57"/>
    <line x1="490" y1="57" x2="520" y2="57"/>
    <line x1="572" y1="130" x2="572" y2="96"/>
  </g>
  <g fill="var(--ink-faint)">
    <polygon points="135,52 142,57 135,62"/>
    <polygon points="263,52 270,57 263,62"/>
    <polygon points="391,52 398,57 391,62"/>
    <polygon points="519,52 526,57 519,62"/>
    <polygon points="567,95 572,88 577,95"/>
  </g>
  <g font-size="13" font-weight="600" fill="var(--ink)" text-anchor="middle">
    <text x="572" y="154">V</text>
  </g>
  <g font-size="10.5" fill="var(--ink-faint)" text-anchor="middle">
    <text x="572" y="170">4×3</text>
  </g>
</svg>
</div>

图 1：注意力的四个步骤。Q 和 K 在前三步里用掉，V 一直等到第 4 步才登场——这是注意力机制最容易被忽略的结构特点：**先决定「看谁」，再决定「拿什么」**。

## 第 1 步：打分 $S = QK^\top$

注意力要回答的第一个问题是「第 $i$ 个 token 该看第 $j$ 个 token 多少」。问的方式是拿第 $i$ 行的查询和第 $j$ 行的键做内积：

$$
S = QK^\top,\qquad S_{ij} = q_i \cdot k_j = \sum_{t=1}^{d_k} q_{i,t}\,k_{j,t}
$$

内积大，表示「我在找的东西」和「你能提供的东西」对上了，这个位置就该被多看几眼。

### 先手算三个格子

拿「苹果」（$i = 3$）这一行做例子。它的查询向量是 $q_3 = [1, 0, 0, 2]$。

**和「吃」（$j = 2$）比**，键是 $k_2 = [1, 0, 1, 2]$：

$$
S_{3,2} = 1 \times 1 + 0 \times 0 + 0 \times 1 + 2 \times 2 = 5
$$

**和「爱」（$j = 1$）比**，键是 $k_1 = [0, 1, 0, 2]$：

$$
S_{3,1} = 1 \times 0 + 0 \times 1 + 0 \times 0 + 2 \times 2 = 4
$$

**和「我」（$j = 0$）比**，键是 $k_0 = [0, -1, -1, -1]$：

$$
S_{3,0} = 1 \times 0 + 0 \times (-1) + 0 \times (-1) + 2 \times (-1) = -2
$$

第 4 个分量在这三个结果里都是 $2 \times k_{j,3}$——苹果的查询在那一维上权重很高，于是「谁的键在第 4 维也大，谁得分就高」。内积就是这么逐个分量相乘再求和的。

### 完整的打分矩阵

四个 token 两两打分，得到 $4 \times 4 = 16$ 个数：

<div class="diagram-scroll">
<svg width="470" height="212" viewBox="0 0 470 212" role="img" aria-label="打分矩阵热力图：行是查询 token，列是被看的键 token，颜色越深分数越高">
  <g font-size="10" fill="var(--ink-faint)" text-anchor="middle">
    <text x="204" y="14">列 = 被看的 token（键 k）</text>
  </g>
  <g font-size="12" fill="var(--ink-muted)" text-anchor="middle">
    <text x="90" y="36">我</text>
    <text x="166" y="36">爱</text>
    <text x="242" y="36">吃</text>
    <text x="318" y="36">苹果</text>
  </g>
  <g font-size="12" fill="var(--ink-muted)" text-anchor="end">
    <text x="44" y="68">我</text>
    <text x="44" y="108">爱</text>
    <text x="44" y="148">吃</text>
    <text x="44" y="188">苹果</text>
  </g>
  <g fill="var(--accent)">
    <rect x="52" y="44" width="76" height="40" fill-opacity="0.17"/>
    <rect x="128" y="44" width="76" height="40" fill-opacity="0.17"/>
    <rect x="204" y="44" width="76" height="40" fill-opacity="0.27"/>
    <rect x="280" y="44" width="76" height="40" fill-opacity="0.69"/>
    <rect x="52" y="84" width="76" height="40" fill-opacity="0.06"/>
    <rect x="128" y="84" width="76" height="40" fill-opacity="0.59"/>
    <rect x="204" y="84" width="76" height="40" fill-opacity="0.48"/>
    <rect x="280" y="84" width="76" height="40" fill-opacity="0.27"/>
    <rect x="52" y="124" width="76" height="40" fill-opacity="0.27"/>
    <rect x="128" y="124" width="76" height="40" fill-opacity="0.06"/>
    <rect x="204" y="124" width="76" height="40" fill-opacity="0.17"/>
    <rect x="280" y="124" width="76" height="40" fill-opacity="0.48"/>
    <rect x="52" y="164" width="76" height="40" fill-opacity="0.06"/>
    <rect x="128" y="164" width="76" height="40" fill-opacity="0.69"/>
    <rect x="204" y="164" width="76" height="40" fill-opacity="0.8"/>
    <rect x="280" y="164" width="76" height="40" fill-opacity="0.17"/>
  </g>
  <rect x="52" y="44" width="304" height="160" fill="none" stroke="var(--line-strong)"/>
  <rect x="52" y="164" width="304" height="40" fill="none" stroke="var(--accent)" stroke-width="2"/>
  <rect x="204" y="164" width="76" height="40" fill="none" stroke="var(--accent-deep)" stroke-width="2"/>
  <g font-size="13" fill="var(--ink)" text-anchor="middle">
    <text x="90" y="69">-1</text>
    <text x="166" y="69">-1</text>
    <text x="242" y="69">0</text>
    <text x="318" y="69">4</text>
    <text x="90" y="109">-2</text>
    <text x="166" y="109">3</text>
    <text x="242" y="109">2</text>
    <text x="318" y="109">0</text>
    <text x="90" y="149">0</text>
    <text x="166" y="149">-2</text>
    <text x="242" y="149">-1</text>
    <text x="318" y="149">2</text>
    <text x="90" y="189">-2</text>
    <text x="166" y="189">4</text>
    <text x="242" y="189">5</text>
    <text x="318" y="189">-1</text>
  </g>
  <g font-size="10.5" fill="var(--accent-deep)">
    <text x="366" y="180">最大 5</text>
    <text x="366" y="194">落在「吃」列</text>
  </g>
</svg>
</div>

图 2：打分矩阵 $S$。颜色越深分数越高；框出的第 3 行是「苹果」的查询，它给出的最高分 5 落在「吃」那一列。

完整的表长这样：

| 查询 $q_i$ \ 键 $k_j$ | 我 | 爱 | 吃 | 苹果 |
| --- | --- | --- | --- | --- |
| **我** | -1 | -1 | 0 | 4 |
| **爱** | -2 | 3 | 2 | 0 |
| **吃** | 0 | -2 | -1 | 2 |
| **苹果** | -2 | 4 | 5 | -1 |

每一行是「一个 token 对所有 token 的评价」。到这里为止，分数还是可正可负、大小没有上限的任意实数——**不能直接当权重用**。后面两步就是把它变成一组和为 1 的权重。

## 第 2 步：缩放，除以 $\sqrt{d_k}$

$$
S' = \frac{S}{\sqrt{d_k}}
$$

本例 $d_k = 4$，所以 $\sqrt{d_k} = 2$，把 $S$ 里每个数除以 2：

| 查询 $q_i$ \ 键 $k_j$ | 我 | 爱 | 吃 | 苹果 |
| --- | --- | --- | --- | --- |
| **我** | -0.5 | -0.5 | 0 | 2 |
| **爱** | -1 | 1.5 | 1 | 0 |
| **吃** | 0 | -1 | -0.5 | 1 |
| **苹果** | -1 | 2 | 2.5 | -0.5 |

这一步只是缩放，不改变每一行里谁大谁小——**排序不变，所以「看谁」的结论不变，变的是分布的陡峭程度**。为什么非得除以 $\sqrt{d_k}$ 而不是别的数，后面单独一节用实测数据说。

## 第 3 步：按行 softmax，变成权重

$$
\alpha_{ij} = \frac{\exp(S'_{ij})}{\sum_{t=1}^{n} \exp(S'_{it})}
$$

注意分母对 $t$ 求和——**归一化是沿着每一行做的**，不是整个矩阵一起归一化。第 $i$ 行的四个权重加起来是 1，代表「第 $i$ 个 token 把它的注意力 100% 分配给了这 4 个位置」。

### 手算「苹果」这一行

这一行的缩放后分数是 $[-1,\ 2,\ 2.5,\ -0.5]$。

实现上不会直接对这四个数取指数，而是**先减去行内最大值**（这里最大值是 $2.5$）再取：

| 步骤 | 我 | 爱 | 吃 | 苹果 |
| --- | --- | --- | --- | --- |
| 缩放后 $S'_{3j}$ | -1 | 2 | 2.5 | -0.5 |
| 减去行最大值 2.5 | -3.5 | -0.5 | 0 | -3 |
| 取指数 $\exp(\cdot)$ | 0.0302 | 0.6065 | 1.0000 | 0.0498 |
| 除以和 1.6865 | **0.0179** | **0.3596** | **0.5929** | **0.0295** |

减最大值这一步不改变结果——分子分母同时乘上了 $e^{-2.5}$，会约掉——但它把最大的那个指数变成 $\exp(0) = 1$，其余都是比 1 小的数，**从根本上避免了 $\exp$ 溢出**。这是 softmax 的标准实现方式，不是这里为了好算才这么写的。

四个权重加起来：$0.0179 + 0.3596 + 0.5929 + 0.0295 = 1$。

### 完整的权重矩阵

四行都算完，得到注意力矩阵 $A$：

<div class="diagram-scroll">
<svg width="470" height="212" viewBox="0 0 470 212" role="img" aria-label="注意力权重矩阵热力图：每一行的四个权重之和为 1">
  <g font-size="10" fill="var(--ink-faint)" text-anchor="middle">
    <text x="204" y="14">每行之和恒为 1</text>
  </g>
  <g font-size="12" fill="var(--ink-muted)" text-anchor="middle">
    <text x="90" y="36">我</text>
    <text x="166" y="36">爱</text>
    <text x="242" y="36">吃</text>
    <text x="318" y="36">苹果</text>
  </g>
  <g font-size="12" fill="var(--ink-muted)" text-anchor="end">
    <text x="44" y="68">我</text>
    <text x="44" y="108">爱</text>
    <text x="44" y="148">吃</text>
    <text x="44" y="188">苹果</text>
  </g>
  <g fill="var(--accent)">
    <rect x="52" y="44" width="76" height="40" fill-opacity="0.11"/>
    <rect x="128" y="44" width="76" height="40" fill-opacity="0.11"/>
    <rect x="204" y="44" width="76" height="40" fill-opacity="0.14"/>
    <rect x="280" y="44" width="76" height="40" fill-opacity="0.68"/>
    <rect x="52" y="84" width="76" height="40" fill-opacity="0.09"/>
    <rect x="128" y="84" width="76" height="40" fill-opacity="0.48"/>
    <rect x="204" y="84" width="76" height="40" fill-opacity="0.31"/>
    <rect x="280" y="84" width="76" height="40" fill-opacity="0.15"/>
    <rect x="52" y="124" width="76" height="40" fill-opacity="0.23"/>
    <rect x="128" y="124" width="76" height="40" fill-opacity="0.12"/>
    <rect x="204" y="124" width="76" height="40" fill-opacity="0.16"/>
    <rect x="280" y="124" width="76" height="40" fill-opacity="0.52"/>
    <rect x="52" y="164" width="76" height="40" fill-opacity="0.07"/>
    <rect x="128" y="164" width="76" height="40" fill-opacity="0.35"/>
    <rect x="204" y="164" width="76" height="40" fill-opacity="0.53"/>
    <rect x="280" y="164" width="76" height="40" fill-opacity="0.08"/>
  </g>
  <rect x="52" y="44" width="304" height="160" fill="none" stroke="var(--line-strong)"/>
  <rect x="52" y="164" width="304" height="40" fill="none" stroke="var(--accent)" stroke-width="2"/>
  <g font-size="12" fill="var(--ink)" text-anchor="middle">
    <text x="90" y="69">.0632</text>
    <text x="166" y="69">.0632</text>
    <text x="242" y="69">.1041</text>
    <text x="318" y="69">.7695</text>
    <text x="90" y="109">.0429</text>
    <text x="166" y="109">.5231</text>
    <text x="242" y="109">.3173</text>
    <text x="318" y="109">.1167</text>
    <text x="90" y="149">.2131</text>
    <text x="166" y="149">.0784</text>
    <text x="242" y="149">.1293</text>
    <text x="318" y="149">.5793</text>
    <text x="90" y="189">.0179</text>
    <text x="166" y="189">.3596</text>
    <text x="242" y="189">.5929</text>
    <text x="318" y="189">.0295</text>
  </g>
  <g font-size="11" fill="var(--accent-deep)" text-anchor="end">
    <text x="440" y="69">行和 = 1</text>
    <text x="440" y="109">行和 = 1</text>
    <text x="440" y="149">行和 = 1</text>
    <text x="440" y="189">行和 = 1</text>
  </g>
</svg>
</div>

图 3：注意力权重矩阵 $A$。和图 2 是同一组数，只是每一行都过了 softmax——每行的四个数现在都在 $[0,1]$ 之间，且加起来恰好是 1。

| 查询 $q_i$ \ 键 $k_j$ | 我 | 爱 | 吃 | 苹果 | 行和 |
| --- | --- | --- | --- | --- | --- |
| **我** | 0.0632 | 0.0632 | 0.1041 | 0.7695 | 1.0000 |
| **爱** | 0.0429 | 0.5231 | 0.3173 | 0.1167 | 1.0000 |
| **吃** | 0.2131 | 0.0784 | 0.1293 | 0.5793 | 1.0000 |
| **苹果** | 0.0179 | 0.3596 | 0.5929 | 0.0295 | 1.0000 |

几个可以直接读出来的现象：

- 「苹果」把 59.29% 的注意力给了「吃」，而给它自己的只有 2.95%——**它更关心谁在吃它，而不是它自己**。
- 「爱」把 52.31% 留给了自己，这是自注意力（self-attention）最常见的形态之一。
- 所有行和精确为 1，一行里的权重构成一个概率分布。这就是为什么它叫「软」注意力：不是硬选一个位置，而是按权重在所有位置上取一个加权平均。

## 第 4 步：加权求和，得到输出

$$
o_i = \sum_{j=1}^{n} \alpha_{ij}\, v_j
$$

到这里 V 才登场：权重已经定好了「看谁」，这一步决定「从每个位置拿走多少」。

### 手算「苹果」的输出

「苹果」那一行的权重是 $[0.0179,\ 0.3596,\ 0.5929,\ 0.0295]$。逐个乘上对应的值向量，再加起来：

| 来源 $j$ | 权重 $\alpha_{3j}$ | 值向量 $v_j$ | 乘完之后 $\alpha_{3j} v_j$ |
| --- | --- | --- | --- |
| 我 | 0.0179 | [2, 0, 1] | [0.036, 0.000, 0.018] |
| 爱 | 0.3596 | [0, 1, 0] | [0.000, 0.360, 0.000] |
| 吃 | 0.5929 | [1, 0, 2] | [0.593, 0.000, 1.186] |
| 苹果 | 0.0295 | [0, 2, 1] | [0.000, 0.059, 0.030] |
| **合计** | 1.0000 | | **[0.629, 0.419, 1.233]** |

第 3 个分量 $1.233$ 里，有 $1.186$ 来自「吃」——因为权重最高的就是「吃」（0.5929），而「吃」的值向量在那一维上恰好是 2。**权重决定了谁说了算，V 决定了它说了什么。**

<div class="diagram-scroll">
<svg width="300" height="160" viewBox="0 0 300 160" role="img" aria-label="苹果的输出向量逐维拆解：每个维度由哪些 token 贡献">
  <g font-size="11" fill="var(--ink-muted)">
    <rect x="40" y="8" width="10" height="10" fill="var(--accent-deep)"/>
    <text x="56" y="18">我</text>
    <rect x="100" y="8" width="10" height="10" fill="var(--accent)"/>
    <text x="116" y="18">爱</text>
    <rect x="160" y="8" width="10" height="10" fill="#6aa9e0"/>
    <text x="176" y="18">吃</text>
    <rect x="220" y="8" width="10" height="10" fill="#a8cdf0"/>
    <text x="236" y="18">苹果</text>
  </g>
  <g font-size="11" fill="var(--ink-muted)" text-anchor="end">
    <text x="44" y="47">第 1 维</text>
    <text x="44" y="89">第 2 维</text>
    <text x="44" y="131">第 3 维</text>
  </g>
  <line x1="52" y1="26" x2="52" y2="142" stroke="var(--line-strong)"/>
  <rect x="52" y="30" width="4.7" height="26" fill="var(--accent-deep)"/>
  <rect x="56.7" y="30" width="77.1" height="26" fill="#6aa9e0"/>
  <text x="142" y="47" font-size="11" fill="var(--ink)">0.629</text>
  <rect x="52" y="72" width="46.7" height="26" fill="var(--accent)"/>
  <rect x="98.7" y="72" width="7.7" height="26" fill="#a8cdf0"/>
  <text x="114" y="89" font-size="11" fill="var(--ink)">0.419</text>
  <rect x="52" y="114" width="2.3" height="26" fill="var(--accent-deep)"/>
  <rect x="54.3" y="114" width="154.2" height="26" fill="#6aa9e0"/>
  <rect x="208.5" y="114" width="3.8" height="26" fill="#a8cdf0"/>
  <text x="220" y="131" font-size="11" fill="var(--ink)">1.233</text>
</svg>
</div>

图 4：把「苹果」的输出向量拆回每一维，看每个 token 贡献了多少。第 1 维和第 3 维几乎全由「吃」构成，第 2 维则主要来自「爱」——**不同维度取决于不同的来源 token**，这正是多头注意力要利用的结构。

四个 token 的输出拼起来，就得到整个输出矩阵 $O$：

| 输出 $o_i$ | 第 1 维 | 第 2 维 | 第 3 维 |
| --- | --- | --- | --- |
| **我** | 0.230 | 1.602 | 1.041 |
| **爱** | 0.403 | 0.757 | 0.794 |
| **吃** | 0.555 | 1.237 | 1.051 |
| **苹果** | 0.629 | 0.419 | 1.233 |

形状是 $4 \times 3$。回到图 1：进来的 Q、K 是 $4 \times 4$，出去的 $O$ 是 $4 \times 3$——**输出宽度跟着 V 走**。这一步之后，$O$ 会送去后面的前馈网络，或者当作下一层的输入。

## 为什么非得除以 $\sqrt{d_k}$

前面说排序不变、只改变陡峭程度。那「不缩放」到底会怎样？实测一下就清楚了。

$q \cdot k = \sum_{t=1}^{d_k} q_t k_t$ 是 $d_k$ 个乘积的和。如果每个分量都独立、均值 0、方差 1，那么每一项的方差是 1，$d_k$ 项加起来**方差就是 $d_k$，标准差是 $\sqrt{d_k}$**。抽样验证（每个维度取 20000 个随机向量对）：

| $d_k$ | $q \cdot k$ 实测标准差 | $\sqrt{d_k}$ |
| --- | --- | --- |
| 4 | 2.002 | 2.000 |
| 16 | 4.021 | 4.000 |
| 64 | 7.972 | 8.000 |
| 256 | 15.902 | 16.000 |
| 512 | 22.786 | 22.627 |

对上了。于是维度一大，进 softmax 的分数就散得很开——**而 softmax 对大的输入差异极其敏感**。

在 $d_k = 512$ 下，取一个查询向量和 20 个键算分数，分别做「不缩放」和「除以 $\sqrt{512}$」的 softmax：

| 试验 | 不缩放：最大权重 | 不缩放：熵 | 缩放后：最大权重 | 缩放后：熵 |
| --- | --- | --- | --- | --- |
| 1 | 1.0000 | 0.000 | 0.2738 | 2.490 |
| 2 | 1.0000 | 0.000 | 0.2663 | 2.469 |
| 3 | 1.0000 | 0.000 | 0.2249 | 2.625 |

不缩放时最大权重是 $1.0000$、熵是 $0.000$——**注意力彻底塌到一个位置上，其他 19 个位置的权重全是 0**。熵为 0 意味着这个分布已经没有任何不确定性，softmax 的梯度在这个区域几乎消失，模型学不动。缩放之后最大权重降到 0.27 左右，熵接近均匀分布的 $\ln 20 \approx 2.996$，分布还有形状、还有梯度。

所以 $\sqrt{d_k}$ 不是一个拍脑袋的常数，它正好是让内积方差回到 1 的那个因子。

## 多头：把上面四步并行做几遍

单个注意力头只能输出一种加权方式。多头注意力把每个头的表示维度切小，并行跑几遍：

$$
\text{head}_h = \mathrm{Attention}(QW_h^Q,\ KW_h^K,\ VW_h^V)
$$
$$
\mathrm{MultiHead}(Q, K, V) = \mathrm{Concat}(\text{head}_1, \dots, \text{head}_H)\,W^O
$$

关键在「切」：$H$ 个头把 $d_k$ 维切成 $H$ 份，每个头只看自己那份。本例 $d_k = 4$、取 $H = 2$，每个头就是 2 维：

<div class="diagram-scroll">
<svg width="620" height="200" viewBox="0 0 620 200" role="img" aria-label="多头注意力：4 维向量切成两个 2 维的头，各自算注意力后再拼接">
  <g font-size="12" fill="var(--ink-muted)" text-anchor="middle">
    <text x="36" y="30">q（4 维）</text>
  </g>
  <rect x="10" y="42" width="52" height="76" fill="var(--surface)" stroke="var(--line-strong)"/>
  <line x1="10" y1="61" x2="62" y2="61" stroke="var(--line-strong)"/>
  <line x1="10" y1="80" x2="62" y2="80" stroke="var(--line-strong)"/>
  <line x1="10" y1="99" x2="62" y2="99" stroke="var(--line-strong)"/>
  <rect x="10" y="42" width="52" height="38" fill="var(--accent)" fill-opacity="0.18"/>
  <g font-size="10" fill="var(--ink-muted)" text-anchor="middle">
    <text x="36" y="65">dim 1–2</text>
    <text x="36" y="103">dim 3–4</text>
  </g>
  <g stroke="var(--ink-faint)">
    <line x1="62" y1="61" x2="112" y2="61"/>
    <line x1="62" y1="118" x2="112" y2="118"/>
  </g>
  <g fill="var(--ink-faint)">
    <polygon points="111,56 118,61 111,66"/>
    <polygon points="111,113 118,118 111,123"/>
  </g>
  <rect x="120" y="36" width="150" height="50" rx="8" fill="var(--surface)" stroke="var(--line-strong)"/>
  <rect x="120" y="100" width="150" height="50" rx="8" fill="var(--surface)" stroke="var(--line-strong)"/>
  <g font-size="12" font-weight="600" fill="var(--ink)" text-anchor="middle">
    <text x="195" y="56">head 1</text>
    <text x="195" y="120">head 2</text>
  </g>
  <g font-size="10" fill="var(--ink-faint)" text-anchor="middle">
    <text x="195" y="72">2 维上算一遍四步</text>
    <text x="195" y="136">2 维上算一遍四步</text>
  </g>
  <g stroke="var(--ink-faint)">
    <line x1="270" y1="61" x2="320" y2="86"/>
    <line x1="270" y1="125" x2="320" y2="104"/>
  </g>
  <g fill="var(--ink-faint)">
    <polygon points="314,83 322,88 313,90"/>
    <polygon points="314,101 322,102 315,108"/>
  </g>
  <rect x="330" y="42" width="52" height="76" fill="var(--surface)" stroke="var(--line-strong)"/>
  <line x1="330" y1="61" x2="382" y2="61" stroke="var(--line-strong)"/>
  <line x1="330" y1="80" x2="382" y2="80" stroke="var(--line-strong)"/>
  <line x1="330" y1="99" x2="382" y2="99" stroke="var(--line-strong)"/>
  <g font-size="10" fill="var(--ink-muted)" text-anchor="middle">
    <text x="356" y="132">拼接</text>
    <text x="356" y="146">4 维</text>
  </g>
  <g stroke="var(--ink-faint)">
    <line x1="382" y1="80" x2="424" y2="80"/>
  </g>
  <g fill="var(--ink-faint)">
    <polygon points="423,75 430,80 423,85"/>
  </g>
  <rect x="432" y="42" width="70" height="76" rx="8" fill="var(--surface)" stroke="var(--line-strong)"/>
  <g font-size="12" font-weight="600" fill="var(--ink)" text-anchor="middle">
    <text x="467" y="76">W<tspan baseline-shift="super" font-size="8">O</tspan></text>
  </g>
  <g font-size="10" fill="var(--ink-faint)" text-anchor="middle">
    <text x="467" y="94">4×4</text>
  </g>
  <g stroke="var(--ink-faint)">
    <line x1="502" y1="80" x2="538" y2="80"/>
  </g>
  <g fill="var(--ink-faint)">
    <polygon points="537,75 544,80 537,85"/>
  </g>
  <g font-size="12" fill="var(--ink)" text-anchor="start">
    <text x="552" y="76">输出</text>
    <text x="552" y="92" font-size="10" fill="var(--ink-faint)">4 维</text>
  </g>
</svg>
</div>

图 5：多头把 4 维切成两个 2 维的头，各算各的四步，结果拼接回 4 维再过一个输出投影 $W^O$。

每个头都完整地跑一遍前面那四步——打分、缩放、softmax、加权求和——但只在它那 2 维上跑。**头与头之间在计算过程中完全不通气**，直到最后拼接才合到一起。

多头为什么有用？直观说法是：一个头学会一种关注模式，比如某个头盯相邻位置、另一个头盯动词和宾语的关系。这是经验观察，不是设计时的硬性保证——真正有保证的是，它给了模型 $H$ 组互相独立的「查询 / 键 / 值」投影，而不是逼着一组投影同时干所有事。代价是计算量不变、但需要多存中间结果，且每个头的维度变小。

## 掩码注意力

前面四步算的是「全都能看」的注意力。但有一大类场景里，**有些位置必须看不见**。

### 为什么需要掩码

最典型的是自回归生成（GPT 那一类模型）：训练时把整句话一次性喂进去，让每个位置预测下一个 token。但第 0 个位置要预测的是第 1 个 token——如果它能在打分阶段看见位置 1 的内容，那就等于直接把答案抄给它。**模型会学会抄答案，然后在推理时发现没有答案可抄。**

所以规则是：**第 $i$ 个位置只能看见 $j \le i$ 的位置**（含自己）。位置 $i$ 看到自己不算作弊——它要预测的是 $i+1$。

### 因果掩码怎么加

做法极其简单：在 softmax 之前，给不该看见的位置加上 $-\infty$。

$$
M_{ij} = \begin{cases} 0, & j \le i \\ -\infty, & j > i \end{cases}
\qquad
S'_{\text{masked}} = S' + M
$$

<div class="diagram-scroll">
<svg width="470" height="212" viewBox="0 0 470 212" role="img" aria-label="因果掩码矩阵：下三角为 0 表示可见，上三角为负无穷表示屏蔽">
  <defs>
    <pattern id="att-f6-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <line x1="0" y1="0" x2="0" y2="6" stroke="var(--line-strong)" stroke-width="1.5"/>
    </pattern>
  </defs>
  <g font-size="10" fill="var(--ink-faint)" text-anchor="middle">
    <text x="204" y="14">列 j（被看的）</text>
  </g>
  <g font-size="12" fill="var(--ink-muted)" text-anchor="middle">
    <text x="90" y="36">我</text>
    <text x="166" y="36">爱</text>
    <text x="242" y="36">吃</text>
    <text x="318" y="36">苹果</text>
  </g>
  <g font-size="12" fill="var(--ink-muted)" text-anchor="end">
    <text x="44" y="68">我</text>
    <text x="44" y="108">爱</text>
    <text x="44" y="148">吃</text>
    <text x="44" y="188">苹果</text>
  </g>
  <g fill="var(--accent-wash)">
    <rect x="52" y="44" width="76" height="40"/>
    <rect x="52" y="84" width="152" height="40"/>
    <rect x="52" y="124" width="228" height="40"/>
    <rect x="52" y="164" width="304" height="40"/>
  </g>
  <g fill="url(#att-f6-hatch)">
    <rect x="128" y="44" width="228" height="40"/>
    <rect x="204" y="84" width="152" height="40"/>
    <rect x="280" y="124" width="76" height="40"/>
  </g>
  <rect x="52" y="44" width="304" height="160" fill="none" stroke="var(--line-strong)"/>
  <path d="M 128 44 L 128 84 L 204 84 L 204 124 L 280 124 L 280 164 L 356 164" fill="none" stroke="var(--accent)" stroke-width="2" stroke-dasharray="5 4"/>
  <g font-size="13" fill="var(--ink)" text-anchor="middle">
    <text x="90" y="69">0</text>
    <text x="90" y="109">0</text>
    <text x="166" y="109">0</text>
    <text x="90" y="149">0</text>
    <text x="166" y="149">0</text>
    <text x="242" y="149">0</text>
    <text x="90" y="189">0</text>
    <text x="166" y="189">0</text>
    <text x="242" y="189">0</text>
    <text x="318" y="189">0</text>
  </g>
  <g font-size="13" fill="var(--ink-muted)" text-anchor="middle">
    <text x="166" y="69">−∞</text>
    <text x="242" y="69">−∞</text>
    <text x="318" y="69">−∞</text>
    <text x="242" y="109">−∞</text>
    <text x="318" y="109">−∞</text>
    <text x="318" y="149">−∞</text>
  </g>
  <g font-size="10.5" fill="var(--accent-deep)">
    <text x="366" y="68">只能看 j ≤ 0</text>
    <text x="366" y="188">能看全部 4 个</text>
  </g>
</svg>
</div>

图 6：因果掩码 $M$。虚线是分界——左下方（$j \le i$）加 0、分数不变；右上方（$j > i$）加 $-\infty$。注意每一行可见的格子数不同：第 0 行只有 1 个，第 3 行有 4 个。

把它加到缩放后的分数上，再照常 softmax。**$\exp(-\infty) = 0$**，所以被屏蔽的位置权重精确为 0，既不贡献输出，也不参与归一化——分母里那几项也是 0，行和依然是 1。

### 手算：加了掩码之后的「爱」

「爱」在位置 $i = 1$，只能看位置 0 和 1。它缩放后的分数本来是 $[-1,\ 1.5,\ 1,\ 0]$，加上掩码后变成 $[-1,\ 1.5,\ -\infty,\ -\infty]$：

| 步骤 | 我 | 爱 | 吃 | 苹果 |
| --- | --- | --- | --- | --- |
| 缩放后 $S'_{1j}$ | -1 | 1.5 | 1 | 0 |
| 加掩码 $M_{1j}$ | 0 | 0 | $-\infty$ | $-\infty$ |
| 掩码后 | -1 | 1.5 | $-\infty$ | $-\infty$ |
| 减去行最大值 1.5 | -2.5 | 0 | $-\infty$ | $-\infty$ |
| 取指数 | 0.0821 | 1.0000 | 0 | 0 |
| 除以和 1.0821 | **0.0759** | **0.9241** | **0** | **0** |

对照没有掩码时「爱」那一行（$[0.0429,\ 0.5231,\ 0.3173,\ 0.1167]$）：本来分给「吃」的 31.73% 和分给「苹果」的 11.67% 全部被收回，**按比例重新分配给了还看得见的两个位置**。「爱」对「我」的注意力从 0.0429 涨到 0.0759，几乎翻倍——不是模型改了主意，是分母变小了。

### 完整的掩码注意力

四行都用各自的掩码（第 $i$ 行挡掉 $j > i$）算一遍：

| 查询 $q_i$ | 我 | 爱 | 吃 | 苹果 | 行和 |
| --- | --- | --- | --- | --- | --- |
| **我** | 1.0000 | 0 | 0 | 0 | 1 |
| **爱** | 0.0759 | 0.9241 | 0 | 0 | 1 |
| **吃** | 0.5065 | 0.1863 | 0.3072 | 0 | 1 |
| **苹果** | 0.0179 | 0.3596 | 0.5929 | 0.0295 | 1 |

| 掩码后的输出 $o_i$ | 第 1 维 | 第 2 维 | 第 3 维 |
| --- | --- | --- | --- |
| **我** | 2.000 | 0.000 | 1.000 |
| **爱** | 0.152 | 0.924 | 0.076 |
| **吃** | 1.320 | 0.186 | 1.121 |
| **苹果** | 0.629 | 0.419 | 1.233 |

对比几个可以直接观察到的点：

- **第 0 行（「我」）的输出是 $[2, 0, 1]$，和 $v_{\text{我}}$ 一模一样。** 这不是巧合：位置 0 没有任何前文可看，权重必然是 $[1,0,0,0]$，输出就是它自己的值向量。这是加掩码后最该先做的 sanity check。
- **最后一行（「苹果」）和没加掩码时完全相同。** 它本来就是最后一个位置，本来就能看见所有 token，掩码对它没有任何影响。
- 中间两行被改动，因为它们的可用上下文变少了。

### 另一个 mask：padding

除了因果掩码，还有一类完全不同来源的掩码。一个 batch 里的句子长短不一，短的要在右边补齐 `<pad>`。这些 pad token 是凑数的，不该被任何位置看见——**被 pad 的列整列屏蔽**。

它的形状和因果掩码不一样，值得分清：

| | 因果掩码 | padding 掩码 |
| --- | --- | --- |
| 形状 | 下三角 | 按列——整列 pad 的位置全屏蔽 |
| 取决于 | 位置 $i$ 与 $j$ 的关系 | 第 $j$ 列是不是 pad |
| 每一行 | 遮罩数量不同（第 $i$ 行挡掉 $n-i-1$ 个） | 完全相同的列被挡掉 |

两者常常同时使用，实现上就是把两个 mask 相加或取逻辑或，再一起加到分数上。

### 一个真实的坑：整行都被屏蔽会得到 NaN

如果某一行的**全部**位置都被屏蔽（比如一个序列从头到尾都是 padding），那么这一行加完掩码后全是 $-\infty$。softmax 要先减去行最大值，而这一行的最大值也是 $-\infty$：

$$
-\infty - (-\infty) = \text{NaN}
$$

**结果是 NaN，不是 0。** 这个 NaN 会顺着反向传播污染整个 batch 的梯度。这也是为什么很多实现用当前 dtype 能表示的最小有限值（比如 `torch.finfo(dtype).min`）去填充，而不是直接用 `-inf`——有限值在整行被屏蔽时至少能得到一个数值结果，不会炸出 NaN。

只要序列里每个样本都至少有一个非 pad token，这行就不会出现。但它确实是 padding 处理里最容易漏掉的一个边界。

## 复杂度

自注意力的计算量落在 $S = QK^\top$ 上：$n \times n$ 个格子，每个格子要做 $d_k$ 次乘法，所以是 $O(n^2 d)$；$AV$ 那一步是 $O(n^2 d_v)$。合起来 $O(n^2 d)$，$n$ 是序列长度。

**平方项来自打分矩阵本身**——每个 token 都要和每个 token 比一次，这是注意力机制的定义决定的，不是实现问题。序列翻倍，计算量翻四倍；这也是长上下文昂贵的根本原因。各种稀疏注意力、线性注意力的工作，改写的都是这个平方项。

顺便说一句：掩码是把 $S$ 的上三角置成 $-\infty$，**并不节省计算**——那些格子照样算出来了，只是算完被丢掉。真正省掉上三角半步计算的，是专门的 fused kernel 干的事。

## 小结

回到那句话：注意力就是把「我该看谁」和「我该拿什么」拆成了两步。

1. **打分** $S = QK^\top$：每个 token 拿自己的查询和所有 token 的键做内积，得到一张 $n \times n$ 的关系表。
2. **缩放** $S / \sqrt{d_k}$：把内积的方差拉回 1，让 softmax 停在有梯度的区间。
3. **归一化** $\mathrm{softmax}$：按行变成和为 1 的权重——这是「软」的地方，不是硬选一个位置。
4. **加权求和** $AV$：用权重把值向量加权平均，得到输出。输出宽度由 V 决定。

掩码只是在这四步的第 3 步之前插了一刀：把不许看的位置变成 $-\infty$，softmax 之后它们的权重精确为 0。
