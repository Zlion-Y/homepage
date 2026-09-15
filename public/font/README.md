# 字体

- `Pacifico-Regular.ttf` —— 站名用的手写体（ASCII + Latin-1 扩展子集，约 84KB，
  由完整版按 `U+0020-007E, U+00A0-00FF` 及常用标点重新子集化，保留全部 OpenType
  连笔特性）。早期版本只裁了 30 个字符，缺大写 M 等字母，导致站名首字母回退成
  无衬线体（2026-09 修复）。

**License:** Pacifico 由 [Google Fonts](https://fonts.google.com/specimen/Pacifico) 提供，采用
[SIL Open Font License 1.1](https://openfontlicense.org/)，可自由使用、修改与随项目分发。

需要更完整的字符集（扩展拉丁、带变音符号的名字等）可以换成完整版：
把 `Pacifico-Regular-all.ttf` 放进本目录，并把 `src/style.css` 里 `@font-face` 的
`src` 改成该文件名即可。
