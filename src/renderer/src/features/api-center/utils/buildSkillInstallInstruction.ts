import type { AgentInstallTarget, SkillInstallSource } from '../model/skillDistribution'

function requestHost(host: string): string {
  return host === '0.0.0.0' ? '127.0.0.1' : host === '::' ? '::1' : host
}

function opening(target: AgentInstallTarget): string {
  switch (target) {
    case 'codex':
      return '请将本地目录中的 WechatExplorer Reader Skill 安装到当前 Codex 项目或用户 Skill 目录：'
    case 'claude-code':
      return '请安装以下本地 WechatExplorer Reader Skill，并按照 SKILL.md 调用本地 HTTP API：'
    case 'openclaw':
      return '请将以下本地目录作为 WechatExplorer Reader Skill 安装，并阅读其中的 SKILL.md：'
    default:
      return '请读取并安装以下 WechatExplorer Reader Skill：'
  }
}

export function buildSkillInstallInstruction({
  target,
  source,
  apiBaseUrl
}: {
  target: AgentInstallTarget
  source: SkillInstallSource
  apiBaseUrl: { host: string; port: number }
}): string {
  const host = requestHost(apiBaseUrl.host)
  const hostPart = host.includes(':') ? `[${host}]` : host
  const healthUrl = `http://${hostPart}:${apiBaseUrl.port}/api/v1/health`
  const sourceText =
    source.type === 'local'
      ? `${opening(target)}\n\n${source.directoryPath}\n\n请先阅读该目录中的 SKILL.md，然后调用：`
      : `请从以下地址安装 WechatExplorer Reader Skill：\n\n${source.installUrl}\n\n阅读 SKILL.md 后，调用：`
  return `${sourceText}\n\n${healthUrl}\n\n验证 WechatExplorer 本地 API 是否已就绪。安装完成后告诉我验证结果。`
}

export function buildSkillVerificationPrompt(): string {
  return '请检查 WechatExplorer Reader 是否已连接，然后列出最近 5 个微信会话。'
}
