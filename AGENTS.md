# AGENTS.md

给 AI 助手的项目说明。

## 简历更新流程

- 网站 CV（`content/cv.md`）与 LaTeX 简历（`cv/`、`不上传-私人简历/`）不会自动同步。
- 动手前先向用户确认改动范围：只改网站，还是网站和 PDF 简历一起改。

## 日期粒度

| 位置 | 粒度 | 格式示例 |
|---|---|---|
| 网站页脚 `content/config.toml` → `last_updated` | 当天，精确到日 | `September 3, 2026` |
| LaTeX 简历页头（中/英/私人版） | 只到月 | `2026年9月` / `September 2026` |

改网站日期时不动 PDF 日期，反之亦然。

## 三版 LaTeX 简历同步

- 内容改动需同步三个文件：`cv/cv.tex`、`cv/cv_cn.tex`、`不上传-私人简历/cv_cn_phone.tex`。
- `不上传-私人简历/` 含手机号，已被 `.gitignore` 忽略，绝不 `git add` / commit。

## 编译与发布

- 本机没有 latexmk，`cv/Makefile` 不可用；用 tectonic 编译：`cd cv && tectonic cv.tex && tectonic cv_cn.tex`。
- 编译后手动复制：`cv.pdf` → `public/files/You_Li_CV.pdf`，`cv_cn.pdf` → `public/files/You_Li_CV_CN.pdf`；私人版 PDF 只留本地。
- 发布：`npm run build` 生成 `out/`；push main 后 GitHub Actions（`deploy.yml`）自动部署。
