// socialLinks.ts — zentrale Liste der Social-Media-Links.
// Früher direkt im Chat-Header (GeminiChat) gerendert, jetzt im
// NETWORK-Menü untergebracht, damit der Chat-Header aufgeräumt bleibt.

export interface SocialLink {
  name: string;
  url: string;
  icon: string;
}

export const SOCIAL_LINKS: SocialLink[] = [
  { name: 'X', url: 'https://x.com', icon: '𝕏' },
  { name: 'Instagram', url: 'https://www.instagram.com', icon: '◎' },
  { name: 'Facebook', url: 'https://www.facebook.com', icon: 'f' },
  { name: 'YouTube', url: 'https://www.youtube.com', icon: '▶' },
  { name: 'TikTok', url: 'https://www.tiktok.com', icon: '♪' },
  { name: 'LinkedIn', url: 'https://www.linkedin.com', icon: 'in' },
  { name: 'GitHub', url: 'https://github.com', icon: '◖' },
  { name: 'Discord', url: 'https://discord.com', icon: '◌' },
  { name: 'Reddit', url: 'https://www.reddit.com', icon: '●' },
  { name: 'Twitch', url: 'https://www.twitch.tv', icon: '▣' },
  { name: 'Telegram', url: 'https://t.me', icon: '➤' },
  { name: 'WhatsApp', url: 'https://www.whatsapp.com', icon: '◔' },
];
