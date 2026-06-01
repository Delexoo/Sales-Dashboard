/**
 * Public site config — safe to commit to GitHub.
 * Supabase publishable URL/key are public client values (RLS + server PIN check protect data).
 * PINs are never stored here — only in Supabase rep_pins.
 */
window.SITE_CONFIG = {
  companyName: "Sales Team Dashboard",
  ownerName: "Delexo",
  ownerHandle: "@delexoo",
  ownerPhotoUrl: "https://raw.githubusercontent.com/Delexoo/Sales-Dashboard/main/doc/meettheowner.jpg",
  ownerBio: "Hi, my name is Delexo. I'm 19 and highly ambitious, and I'm always willing to take risks. I completed and earned Harvard CS50 and Google's Cybersecurity Certificate in 2025, and I'm currently pursuing Harvard's Cybersecurity for Business program.\n\nMy interests include cybersecurity, computer science, and entrepreneurship. Over the years, I've worked on a variety of innovative softwares and cybersecurity projects, explored some of the deepest parts of the internet, and continuously expanded my technical skills through self-learning and hands-on experience.\n\nFeel free to reach out anytime. If you have any questions or concerns, I'm always happy to help, whether by text, phone call, or a scheduled meeting.",
  ownerStoreUrl: "https://delexo.store",
  ownerCalUrl: "https://cal.com/delexo",
  honorableMentionName: "Coming soon",
  honorableMentionBio: "Profile coming soon — same image as a placeholder until your friend’s details are added here.",
  honorableMentionPhotoUrl: "https://raw.githubusercontent.com/Delexoo/Sales-Dashboard/main/doc/meettheowner.jpg",
  contributors: ["Culson","Zackary","Nolan","Addie","Losan","David","Misha","Delexo"],
  contributorsShareUrl: "https://tally.so/r/1AGlbg",
  contributorsShareLabel: "Invite",
  contributorsShareHint: "Invite someone to apply",
  contributorsShareTitle: "Earn up to $600 Per Sale!",
  contributorsShareText: "Join our sales team as a cold caller — apply here:",
  ownerTelegram: "https://t.me/delexoo",
  supportTelegram: "https://t.me/delexoo",
  telegramTeam: "https://t.me/c/3541685239/1",
  telegramTeamName: "Official Telegram Business Chat",
  telegramTeamDisplayName: "Website Agency",
  telegramTeamJoinLabel: "Join Official Telegram Business Chat",
  telegramTeamAvatar: "https://github.com/Delexoo/Sales-Dashboard/blob/main/doc/Crown.jpg?raw=true",
  telegramAppIcon: "https://github.com/Delexoo/Sales-Dashboard/blob/main/doc/Telegram.png?raw=true",
  interestedBusinessesUrl: "https://t.me/c/3541685239/8",
  payoutTelegramUrl: "https://t.me/+U9wsP-sf8GFmNWFh",
  payoutTelegramName: "Website Agency",
  leadsListUrl: "leads.html",
  supabaseUrl: "https://qisqgdffekqeprhjklyd.supabase.co",
  supabaseAnonKey: "sb_publishable_2ULS4fB1YKnpmRzGgwuy2g_Z6Y2OCPw",
  useSupabaseLeads: true,
  useRepSettingsSync: true,
  useBugReports: true,
  useFeedback: true,
  useFaqQa: true,
  onboardingVideoUrl: "https://youtu.be/BPbOQqbex98?si=wBPx0bqtRxfaQJrf",
  courseModuleVideos: {},
  onboardingVideoLabel: "Legacy fallback video (until per-module clips are set)",
  email: "fullprofessionalwebsites@outlook.com",
  phone: "(401) 300-0957",
  packages: [
    { upfront: "$500", monthly: "$5/mo", commission: "$200" },
    { upfront: "$700", monthly: "$20/mo", commission: "$280" },
    { upfront: "$1,000", monthly: "$10/mo", commission: "$400" },
    { upfront: "$1,500", monthly: "$10/mo", commission: "$600" }
  ],
  reps: []
};
