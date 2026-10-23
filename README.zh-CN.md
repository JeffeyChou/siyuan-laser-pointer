[English](https://github.com/JeffeyChou/siyuan-laser-pointer/blob/main/README.md)

# 激光笔

演示时在笔记上圈画、指点重点。

* 开关：顶栏的激光笔图标，或快捷键 `Alt+Shift+L`（macOS：`⌥⇧L`）。也可以在 设置 → 快捷键 里给“激光笔”换一个按键。
* 画：按住鼠标左键拖动。松开后笔迹保留约 1 秒，然后淡出。
* 滚动：激光笔开着时滚轮照常滚动下面的文档。
* 退出：`Esc`、鼠标右键，或再点一次图标、再按一次快捷键。
* 激光笔开着时不能编辑和点击笔记；笔迹不会写进文档。

## 开发

```bash
pnpm i
pnpm run build   # 生成 dist/ 和 package.zip
```

把 `package.zip` 解压到 `{工作空间}/data/plugins/siyuan-laser-pointer/` 即可安装本地构建。

## 许可

MIT
