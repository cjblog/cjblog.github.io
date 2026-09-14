/**
 * 站点级常量。站名与描述沿用原博客，改这里即可全站生效。
 */
export const SITE = {
  title: '土豆不吃鱼',
  description: '算法，python，大模型，思考，读书，编程，NLP，自然语言处理',
  url: 'https://cjblog.github.io',
} as const;

/** 首页的两个导航模块。projects 是默认模块，对应根路径。 */
export const MODULES = [
  { id: 'projects', label: '项目浏览', hash: '' },
  { id: 'posts', label: '技术文章', hash: '#posts' },
] as const;

export type ModuleId = (typeof MODULES)[number]['id'];
