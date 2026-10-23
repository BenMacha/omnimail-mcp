import type { Language, Settings } from "./config.js";
import type { Category } from "./services/classify.js";

/** Names of the folders omnimail creates, per language. */
interface FolderNames {
  root: string;
  archive: string;
  trash: string;
  drafts: string;
  sent: string;
  misc: string;
  categories: Record<Category, string>;
}

export const FOLDER_NAMES: Record<Language, FolderNames> = {
  en: {
    root: "Sorted",
    archive: "Archive",
    trash: "Trash",
    drafts: "Drafts",
    sent: "Sent",
    misc: "Misc",
    categories: {
      security: "Security",
      invoices: "Invoices",
      banking: "Banking",
      administration: "Administration",
      travel: "Travel",
      orders: "Orders",
      social: "Social",
      newsletters: "Newsletters",
      notifications: "Notifications",
    },
  },
  fr: {
    root: "Classement",
    archive: "Archives",
    trash: "Corbeille",
    drafts: "Brouillons",
    sent: "Envoyés",
    misc: "Divers",
    categories: {
      security: "Sécurité",
      invoices: "Factures",
      banking: "Banque",
      administration: "Administratif",
      travel: "Voyages",
      orders: "Commandes",
      social: "Réseaux sociaux",
      newsletters: "Newsletters",
      notifications: "Notifications",
    },
  },
  ar: {
    root: "مرتب",
    archive: "الأرشيف",
    trash: "المهملات",
    drafts: "المسودات",
    sent: "المرسلة",
    misc: "متفرقات",
    categories: {
      security: "الأمان",
      invoices: "الفواتير",
      banking: "البنوك",
      administration: "الإدارة",
      travel: "السفر",
      orders: "الطلبات",
      social: "التواصل الاجتماعي",
      newsletters: "النشرات",
      notifications: "الإشعارات",
    },
  },
};

export function folderNames(settings: Pick<Settings, "language">): FolderNames {
  return FOLDER_NAMES[settings.language] ?? FOLDER_NAMES.en;
}

export function sortRoot(settings: Pick<Settings, "language" | "classifyRoot">): string {
  return settings.classifyRoot || folderNames(settings).root;
}
