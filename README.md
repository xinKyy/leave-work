# OFF DUTY · 准点下班

一个使用 Three.js 的 3D 办公室潜行游戏 MVP。玩家需要观察经理的视野，躲过巡逻，找到随机掉落的门禁卡，然后从正门或后门离开。两名经理会在多条可达出口的巡逻路线中随机选路。

## 运行

```bash
npm install
npm run dev
```

打开终端输出的本地地址。生产构建使用 `npm run build`，测试使用 `npm test`。

开发服务器已绑定到 `0.0.0.0`，同一局域网内的设备可访问当前电脑地址：`http://192.168.0.187:4173/`。如果路由器重新分配了 IP，请用 `ifconfig` 查看当前 `en0` 的 `inet` 地址。

排查移动问题时，在地址后加 `?debug`，例如 `http://localhost:4173/?debug`。右下角会显示移动和碰撞日志，点击“复制”后把内容发回即可；同时日志也会输出到浏览器控制台。

## 操作

- `W A S D`：移动
- `Shift`：快跑，体力会消耗
- `E`：拿门禁卡或持续刷门
- `Q / R`：小幅旋转镜头
- `Esc` 或空格：暂停

黄色扇形是经理的视线，红色表示已经进入追赶状态。墙壁和办公桌会挡住视线。两个出口都需要先找到随机位置的门禁卡；按住 `E` 开门需要 5 秒，期间的声音会让两名经理赶来。

## 协作开发

项目仓库：[github.com/xinKyy/leave-work](https://github.com/xinKyy/leave-work)

欢迎提交功能、修复问题和关卡创意。推荐使用独立分支并通过 Pull Request 合并：

```bash
git clone https://github.com/xinKyy/leave-work.git
cd leave-work
npm install
git checkout -b feat/your-change
```

开发完成后先运行 `npm test` 和 `npm run build`，再提交并推送分支：

```bash
git add .
git commit -m "describe your change"
git push -u origin feat/your-change
```

然后在 GitHub 创建 Pull Request，并在描述中写清楚改动内容、测试结果和需要关注的地方。小型修复可以直接提交，涉及玩法、地图或 UI 的改动请先开 Issue 讨论。私有仓库需要仓库所有者先在 GitHub 的 Settings → Collaborators 中邀请贡献者。

## 技术说明

核心状态与规则在 `src/simulation.ts`，Three.js 场景和模型加载在 `src/world.ts`，浏览器输入与界面在 `src/main.ts`。人物模型使用 Quaternius 的 CC0 资源，来源和哈希记录在 `ASSETS.md`。模型加载失败时会自动使用内置低多边形角色，游戏仍然可以操作。
