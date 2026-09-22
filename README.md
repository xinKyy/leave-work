# OFF DUTY · 准点下班

一个使用 Three.js 的 3D 办公室潜行游戏 MVP。玩家需要观察经理的视野，躲过巡逻，找到随机掉落的门禁卡，然后从正门或后门离开。两名经理会在多条可达出口的巡逻路线中随机选路。

## 运行

```bash
npm install
npm run dev
```

打开终端输出的本地地址。生产构建使用 `npm run build`，测试使用 `npm test`。

开发服务器已绑定到 `0.0.0.0`，同一局域网内的设备可访问当前电脑的局域网地址：`http://<你的局域网地址>:4173/`。如果不知道当前地址，可以查看操作系统的网络设置。

排查移动问题时，在地址后加 `?debug`，例如 `http://localhost:4173/?debug`。右下角会显示移动和碰撞日志，点击“复制”后把内容发回即可；同时日志也会输出到浏览器控制台。

## 操作

- `W A S D`：移动
- `Shift`：快跑，体力会消耗
- `E`：拿门禁卡或持续刷门
- `Q / R`：小幅旋转镜头
- `Esc` 或空格：暂停

黄色扇形是经理的视线，红色表示已经进入追赶状态。墙壁和办公桌会挡住视线。两个出口都需要先找到随机位置的门禁卡；按住 `E` 开门需要 5 秒，期间的声音会让两名经理赶来。

## 协作开发

项目仓库：请在当前 GitHub 仓库页面查看 Issues 和 Pull Requests。

欢迎提交功能、修复问题和关卡创意。推荐使用独立分支并通过 Pull Request 合并：

```bash
git clone <仓库地址>
cd <仓库目录>
npm install
git checkout -b feat/your-change
```

开发完成后先运行 `npm test` 和 `npm run build`，再提交并推送分支：

```bash
git add .
git commit -m "describe your change"
git push -u origin feat/your-change
```

然后在 GitHub 创建 Pull Request，并在描述中写清楚改动内容、测试结果和需要关注的地方。小型修复可以直接提交，涉及玩法、地图或 UI 的改动请先开 Issue 讨论。仓库启用协作者限制时，需要仓库所有者先在 GitHub 的协作者设置中邀请贡献者。

## 部署到 Sealos

这是一个纯前端单机游戏，不需要数据库、后端接口或 WebSocket。使用 Docker 打包后，让 Nginx 提供 `dist` 静态文件即可。

### 方式一：Sealos 直接从 GitHub 构建

1. 在 Sealos 的应用部署页面选择从 GitHub 仓库构建，填写你的仓库地址。
2. 构建方式选择 Dockerfile，分支选择 `main`。
3. 容器端口填写 `80`，协议选择 HTTP；CPU `0.25` 核、内存 `256Mi` 通常足够。
4. 创建并等待构建完成，然后打开 Sealos 分配的公网域名。

### 方式二：本地构建后推送镜像

```bash
docker build -t leave-work:latest .
docker run --rm -p 8080:80 leave-work:latest
```

本地打开 `http://localhost:8080/` 验证后，把镜像推送到 Docker Hub、GHCR 或 Sealos 支持的镜像仓库，再在 Sealos 中填写该镜像地址。容器端口仍然填写 `80`，不要填写开发环境的 `5173`。

部署检查：确认公网地址能返回游戏首页、`/assets/player.gltf` 能正常加载，并在手机或另一台电脑上实际打开一次。更新代码后重新构建镜像并重新部署；如果使用 GitHub 自动构建，推送到 `main` 后按 Sealos 的重新部署或自动构建设置执行。

## GitHub Actions 自动部署

仓库已经包含 `.github/workflows/ci.yml` 和 `.github/workflows/deploy.yml`：所有 PR 会自动跑测试和构建，PR 合并到 `main` 后会构建镜像、推送到 GHCR，并通过 `kubectl` 更新 Sealos Deployment。

首次配置需要在 GitHub 仓库的 Settings → Secrets and variables → Actions 中添加：

- `SEALOS_KUBECONFIG_B64`：Sealos 集群 kubeconfig 文件经过 Base64 编码后的内容。
- `SEALOS_NAMESPACE`：Sealos 应用所在的命名空间，不要填写 Workspace 展示名称。

不要把 kubeconfig、Sealos Token 或 GHCR 密码提交到仓库。可以在本地执行 `base64 -i kubeconfig.yaml | pbcopy`，然后把剪贴板内容粘贴到 `SEALOS_KUBECONFIG_B64`。Sealos 需要能够拉取 GHCR 镜像：可以将 `ghcr.io/<owner>/<repo>` 设置为公开包；如果保持私有，则在 Sealos 命名空间创建镜像拉取 Secret，并在 `deploy/k8s/deployment.yaml` 的 Pod 配置中加入该 Secret。

工作流会创建一个供 Ingress 使用的 `ClusterIP` Service。请在 Sealos 中为 Ingress 绑定域名或使用平台分配的公网域名。对 `main` 的每次合并都会发布新的镜像并等待滚动更新完成。

如果工作流报 `User ... is forbidden`，说明 kubeconfig 的身份已经正确，但没有 Kubernetes 写权限。请使用 Sealos 管理员 kubeconfig 在目标 namespace 执行一次授权：

```bash
export KUBECONFIG=/path/to/sealos-admin-kubeconfig.yaml
export SEALOS_NAMESPACE=your-sealos-namespace
sed "s/TARGET_NAMESPACE/$SEALOS_NAMESPACE/g" deploy/k8s/rbac.yaml | kubectl apply -f -
```

这条 Role 只允许该身份管理本项目的 Deployment 和 Service，不授予整个集群的管理员权限。授权后可以在 GitHub Actions 重新运行失败的 `Deploy to Sealos`，或者合并一个新的 PR 触发发布。

## 技术说明

核心状态与规则在 `src/simulation.ts`，Three.js 场景和模型加载在 `src/world.ts`，浏览器输入与界面在 `src/main.ts`。人物模型使用 Quaternius 的 CC0 资源，来源和哈希记录在 `ASSETS.md`。模型加载失败时会自动使用内置低多边形角色，游戏仍然可以操作。
