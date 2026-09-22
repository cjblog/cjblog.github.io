---
title: LaTeX 数学公式常用语法
date: 2025-09-14
tags: [LaTeX, KaTeX, 排版, 速查]
summary: 一份可以直接抄的 LaTeX 公式语法速查：上下标、分数、大型运算符、矩阵、分段函数、多行对齐，以及 KaTeX 不支持的那些写法。
pinned: false
---

这个站点用 KaTeX 渲染数学公式。KaTeX 是 LaTeX 的一个子集，覆盖了写技术文章会用到的绝大部分语法，但并非全部——用错命令时公式不会静默失败，而是会显示成一段红色报错，所以值得把边界记清楚。

这篇把常用写法整理成可以直接抄的形式，最后列出几个容易踩的坑。

## 行内公式与行间公式

行内公式用单个美元符号包裹，跟着文字一起排版：

```text
质能方程 $E = mc^2$ 说明了质量与能量的关系。
```

效果：质能方程 $E = mc^2$ 说明了质量与能量的关系。

行间公式用两个美元符号包裹，公式会独立成行并居中。**记得 `$$` 前后留空行**，否则它可能被当成段落内的一部分：

```text
$$
\int_{0}^{\infty} e^{-x^{2}} \, \mathrm{d}x = \frac{\sqrt{\pi}}{2}
$$
```

效果：

$$
\int_{0}^{\infty} e^{-x^{2}} \, \mathrm{d}x = \frac{\sqrt{\pi}}{2}
$$

## 上下标

下标用 `_`，上标用 `^`。内容超过一个字符时要用花括号包起来，否则只有紧跟的那个字符会被当作上下标：

| 写法 | 效果 | 说明 |
| --- | --- | --- |
| `x_1` | $x_1$ | 单字符不用括号 |
| `x_{10}` | $x_{10}$ | 多字符必须加括号 |
| `x^2` | $x^2$ | 上标同理 |
| `x^{n+1}` | $x^{n+1}$ | |
| `x_i^2` | $x_i^2$ | 同时有上下标 |
| `a^{b^{c}}` | $a^{b^{c}}$ | 嵌套要一层层加括号 |

一个常见的错误是写成 `x_10`，它会被解析成 $x_1 0$ 而不是 $x_{10}$。

## 分数、根号与二项式

```latex
\frac{a}{b}          % 普通分数
\dfrac{a}{b}         % 强制显示为大号分数（行内也撑开）
\tfrac{a}{b}         % 强制小号
\sqrt{x}             % 平方根
\sqrt[3]{x}          % n 次方根
\binom{n}{k}         % 组合数
```

效果分别是 $\frac{a}{b}$、$\dfrac{a}{b}$、$\sqrt{x}$、$\sqrt[3]{x}$、$\binom{n}{k}$。

行内公式里的分数默认会被压扁以适配行高，需要它保持大小就用 `\dfrac`；反过来，行间公式里想收窄就用 `\tfrac`。

## 希腊字母

小写直接拼名字，大写把首字母大写。少数几个长得不一样的需要单独记：

| 小写 | 写法 | 大写 | 写法 |
| --- | --- | --- | --- |
| $\alpha$ | `\alpha` | $\Gamma$ | `\Gamma` |
| $\beta$ | `\beta` | $\Delta$ | `\Delta` |
| $\gamma$ | `\gamma` | $\Theta$ | `\Theta` |
| $\theta$ | `\theta` | $\Lambda$ | `\Lambda` |
| $\lambda$ | `\lambda` | $\Sigma$ | `\Sigma` |
| $\mu$ | `\mu` | $\Phi$ | `\Phi` |
| $\pi$ | `\pi` | $\Psi$ | `\Psi` |
| $\sigma$ | `\sigma` | $\Omega$ | `\Omega` |
| $\phi$ | `\phi` | | |
| $\varphi$ | `\varphi` | | |

关于 `\phi` 与 `\varphi`、`\epsilon` 与 `\varepsilon`：这两组是两个不同的符号，不是大小号关系，用哪个取决于你所在领域的习惯。

## 大型运算符

求和、求积、积分、极限的上下限写在 `_` 和 `^` 里：

```latex
\sum_{i=1}^{n} i^2
\prod_{i=1}^{n} x_i
\int_{a}^{b} f(x) \, \mathrm{d}x
\oint_{C} \mathbf{F} \cdot \mathrm{d}\mathbf{r}
\lim_{x \to 0} \frac{\sin x}{x}
```

效果：

$$
\sum_{i=1}^{n} i^2 \qquad \prod_{i=1}^{n} x_i \qquad \int_{a}^{b} f(x) \, \mathrm{d}x \qquad \oint_{C} \mathbf{F} \cdot \mathrm{d}\mathbf{r} \qquad \lim_{x \to 0} \frac{\sin x}{x}
$$

行内使用时，上下限会挪到符号右侧以节省行高：$\sum_{i=1}^{n} i^2$。想强制让它待在上方，可以在公式开头加 `\displaystyle`。

积分号后面的 `\,` 是一段细空格，用来把被积函数和 $\mathrm{d}x$ 分开。正体的微分符号写作 `\mathrm{d}`，这样它不会像变量一样变成斜体。

## 括号的自动缩放

直接写 `(` `)` 时括号高度固定，包不住高个子的内容。用 `\left` 和 `\right` 让它们自动撑开：

```latex
\left( \frac{a}{b} \right)          % 圆括号
\left[ \frac{a}{b} \right]          % 方括号
\left\{ \frac{a}{b} \right\}        % 花括号要转义
\left\lvert \frac{a}{b} \right\rvert  % 绝对值
\left\| \mathbf{x} \right\|         % 范数
```

效果：$\left( \frac{a}{b} \right)$、$\left\{ \frac{a}{b} \right\}$、$\left\lvert \frac{a}{b} \right\rvert$、$\left\| \mathbf{x} \right\|$。

`\left` 和 `\right` 必须成对出现。只想在一边加括号时，另一边用 `\right.` 占位：

$$
\left. \frac{\mathrm{d}y}{\mathrm{d}x} \right|_{x=0}
$$

花括号在 LaTeX 里是分组符号，所以字面量的花括号必须写成 `\{` 和 `\}`。

## 矩阵

矩阵用 `\begin{...}` 与 `\end{...}` 包裹，行内用 `&` 分隔单元格，用 `\\` 换行。三种括号对应三种环境：

```latex
\begin{pmatrix} a & b \\ c & d \end{pmatrix}   % 圆括号
\begin{bmatrix} a & b \\ c & d \end{bmatrix}   % 方括号
\begin{vmatrix} a & b \\ c & d \end{vmatrix}   % 行列式竖线
```

效果：

$$
\mathbf{A} = \begin{pmatrix} a_{11} & a_{12} \\ a_{21} & a_{22} \end{pmatrix}
\qquad
\det(\mathbf{A}) = \begin{vmatrix} a_{11} & a_{12} \\ a_{21} & a_{22} \end{vmatrix}
$$

需要三列以上时，把 `matrix` 换成 `array` 并在 `\begin{array}` 后声明列对齐方式（`c` 居中、`l` 左对齐、`r` 右对齐）：

```latex
\begin{array}{c|c}
  x & y \\ \hline
  1 & 2
\end{array}
```

$$
\begin{array}{c|c}
  x & y \\ \hline
  1 & 2
\end{array}
$$

## 分段函数

`cases` 环境专门用来写分段定义，每行用 `&` 分隔「表达式」和「条件」：

```latex
f(x) = \begin{cases}
  x^2, & x \geq 0 \\
  -x,  & x < 0
\end{cases}
```

$$
f(x) = \begin{cases}
  x^2, & x \geq 0 \\
  -x,  & x < 0
\end{cases}
$$

## 多行公式对齐

**注意 KaTeX 不支持 `align` 环境**，要用 `aligned`（少一个 i）并放在行间公式里。用 `&` 标出对齐位置，用 `\\` 换行：

```latex
\begin{aligned}
  (a+b)^2 &= a^2 + 2ab + b^2 \\
          &= a^2 + b^2 + 2ab
\end{aligned}
```

$$
\begin{aligned}
  (a+b)^2 &= a^2 + 2ab + b^2 \\
          &= a^2 + b^2 + 2ab
\end{aligned}
$$

对齐位置由 `&` 决定，所以第二行的 `&` 前面留空格、第一行不留，让等号在源码里也对齐，改起来更清楚。

推导里常用 `\xrightarrow{}` 在箭头上下方写条件：

$$
A \xrightarrow{n \to \infty} B
$$

## 文字、空格与字体

公式里的中文或说明性文字要用 `\text{}` 包起来，否则会被当成一串变量，字母之间还会被排成斜体：

```latex
\{ x \mid x \in \mathbb{R},\ \text{且 } x > 0 \}
```

$$
\{ x \mid x \in \mathbb{R},\ \text{且 } x > 0 \}
$$

LaTeX 会忽略源码里的普通空格，所以间距要显式写出来：

| 写法 | 宽度 | 用途 |
| --- | --- | --- |
| `\,` | 细 | 微分符号与被积函数之间 |
| `\ ` | 中等 | 普通词间空格 |
| `\quad` | 一个汉字宽 | 并列几个公式 |
| `\qquad` | 两个汉字宽 | 更宽的间隔 |
| `\!` | 负的细空格 | 收紧间距 |

字体方面，常用这几类：

| 写法 | 效果 | 含义 |
| --- | --- | --- |
| `\mathbb{R}` | $\mathbb{R}$ | 数集（实数集、整数集） |
| `\mathcal{L}` | $\mathcal{L}$ | 花体，常用于损失函数、拉普拉斯变换 |
| `\mathbf{x}` | $\mathbf{x}$ | 粗体，向量与矩阵 |
| `\mathrm{d}` | $\mathrm{d}$ | 正体，微分算子、单位 |
| `\mathit{}` | $\mathit{ABC}$ | 斜体文字 |
| `\operatorname{softmax}` | $\operatorname{softmax}$ | 多字母函数名，自动排成正体 |

同时处理上下标和装饰：`\vec{v}` 得 $\vec{v}$，`\hat{y}` 得 $\hat{y}$，`\bar{x}` 得 $\bar{x}$，`\dot{x}` 得 $\dot{x}$，`\overline{AB}` 得 $\overline{AB}$，`\underbrace{a+b}_{n \text{ 项}}` 得 $\underbrace{a+b}_{n \text{ 项}}$。

## 常用符号速查

| 类别 | 写法 | 效果 |
| --- | --- | --- |
| 乘除 | `\cdot` `\times` `\div` | $\cdot$ $\times$ $\div$ |
| 正负 | `\pm` `\mp` | $\pm$ $\mp$ |
| 比较 | `\leq` `\geq` `\neq` `\approx` `\equiv` | $\leq$ $\geq$ $\neq$ $\approx$ $\equiv$ |
| 正比 | `\propto` `\sim` | $\propto$ $\sim$ |
| 集合 | `\in` `\notin` `\subset` `\subseteq` | $\in$ $\notin$ $\subset$ $\subseteq$ |
| 集合运算 | `\cup` `\cap` `\emptyset` | $\cup$ $\cap$ $\emptyset$ |
| 箭头 | `\to` `\rightarrow` `\Rightarrow` `\mapsto` | $\to$ $\rightarrow$ $\Rightarrow$ $\mapsto$ |
| 逻辑 | `\forall` `\exists` `\neg` `\land` `\lor` | $\forall$ $\exists$ $\neg$ $\land$ $\lor$ |
| 特殊 | `\infty` `\partial` `\nabla` `\hbar` | $\infty$ $\partial$ $\nabla$ $\hbar$ |
| 函数 | `\sin` `\cos` `\log` `\ln` `\exp` `\det` | $\sin$ $\cos$ $\log$ $\ln$ $\exp$ $\det$ |

函数名要带反斜杠写（`\sin` 而不是 `sin`），否则会被排成三个变量相乘 $s \cdot i \cdot n$。

## 容易踩的坑

**反斜杠在 Markdown 与 LaTeX 里都是特殊字符。** 矩阵和 `cases` 的换行要写两个反斜杠 `\\`；花括号、下划线、百分号做字面量时要转义：`\{`、`\_`、`\%`。

**下划线在公式外是斜体语法。** `$x_1$` 里面的没问题，但正文里想打出字面的下划线要写成 `\_`，或者用行内代码包起来。

**美元符号当货币时容易误判。** 行内公式的规则是：开头的 `$` 后面不能紧跟空格，结尾的 `$` 前面也不能是空格。所以 `售价 $5 到 $10` 这种写法有风险——如果两个 `$` 恰好满足配对条件，中间的文字就会被当成公式。写钱的时候用 `\$` 转义，或者放进行内代码。

**行间公式前后要有空行。** 紧贴在文字后面时，它可能不被识别成独立的公式块。

**KaTeX 不是完整的 LaTeX。** 下面这些常见写法在本站**会渲染成红色报错**：

| 不支持的写法 | 替代方案 |
| --- | --- |
| `\begin{align}` `\begin{equation}` `\begin{gather}` | 用 `aligned` 并放进 `$$...$$` |
| `\label{}` `\ref{}` `\eqref{}` | 不支持公式编号与交叉引用，正文里手工写「式 (1)」 |
| `\usepackage` `\documentclass` | 这是文档级命令，网页里没有对应概念 |
| `\begin{tabular}` | 用 `array` 环境，或用 Markdown 表格 |
| `\hspace{}` `\vspace{}` `\hfill` | 用 `\,` `\ ` `\quad` `\qquad` 控制水平间距 |
| 自定义宏（`\newcommand`） | 本站没有预置任何宏，重复的表达式请直接展开 |

最后一条实践建议：公式写完先在本地 `npm run dev` 看一眼。KaTeX 遇到不认识的命令会明确报错而不是悄悄排错，所以只要页面上没有红色文字，就说明语法没问题。
