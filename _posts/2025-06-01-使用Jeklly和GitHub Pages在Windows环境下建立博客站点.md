---
layout: post
title: 用Jeklly和GitHub Pages在Windows折腾博客
date: '2025-06-01 12:00:0 +0800'
categories: [技术, 博客搭建]
tag: [经验分享]
author: liyou
description: 对建立本站使用的一些技术进行简要介绍。
toc: true # 是否需要目录
---

>正在施工中
{: .prompt-warning }

>参考[官方教程](https://chirpy.cotes.page/posts/getting-started/)和[使用 Jeklly + Github Pages 搭建个人博客(1)
](https://wizard23333.github.io/posts/build-your-blog-1/)，基于我的Windows开发环境搭建。有相当一部分内容是上述流程的翻译。
{: .prompt-info }

# 动机和思考

最近在考虑建一个站点作为在线简历、论文分享、折腾记录使用，但是注册、备案域名、租赁服务器并且维护其实是比较折腾、并且需要人力物力的事情。此外国内常见的平台的个性化水平不足，还可能会受到一些不必要的限制（如充值会员or关注）才能阅读。这并不是我想要的效果。所以就考虑免费并且常用的GitHub Pages来进行操作。

不过GitHub Pages也有相应的缺点，带宽和存储空间都有相应的限制；此外操作并不如图形化的界面方便。以及如果有一段时间不折腾会忘记并且需要从头再来，所以还是写下来记录一下好了。

# 关于GitHub Pages的配置
## 关于Git和GitHub
要做的第一件事情是[注册GitHub账号](https://docs.github.com/en/get-started/start-your-journey/creating-an-account-on-github)，然后在你的电脑上[安装Git](https://git-scm.com/downloads)，并且在你的电脑上绑定相应的账户（教程）。

## 设置对应的仓库

建议直接fork[chirpy-starter](https://github.com/cotes2020/chirpy-starter)

## 在Windows下使用Docker Desktop 搭配VS Code进行操作
1.安装Docker Desktop；

2.安装VS Code 和 Dev Containers extension；

3.按照VS Code的官方教程，把你fork的仓库clone到本地的容器中。请注意，这一步即使网络畅通也通常需要一点时间。

4.待上述流程完成之后，可以运行：
```bash
bundle exec jekyll serve
```
就可以看到[http://127.0.0.1:4000](http://127.0.0.1:4000)有相应的界面了。但是请务必注意，运行上述流程请一定要在上述操作的VS Code 终端当中，如下图所示。

![vscode_terminal](assets/images/2025-06-01/vscode_terminal.png)

## 部署到GitHub Pages

# 如何撰写博文？

## 新博文和Front Matter

比较需要注意的点是

其他的请直接参考官方博客[]()

## 利用markdown来撰写


可以利用这个方式来在顶部加入info提示
```markdown
>参考[官方教程](https://chirpy.cotes.page/posts/getting-started/)和[使用 Jeklly + Github Pages 搭建个人博客(1)
](https://wizard23333.github.io/posts/build-your-blog-1/)，基于我的Windows开发环境搭建。
{: .prompt-info }
```

插图片的时候尽可能插入在```/assets/images/```的路径下，不要插入在前缀带```_```的路径下，这样子可能会造成图片无法读取。



# 如何个性化博客页面？

## 改动网站的标题图

## 

# 题外话


