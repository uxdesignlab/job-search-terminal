import {
  BarChart3,
  Bot,
  BriefcaseBusiness,
  FileText,
  Globe2,
  KeyRound,
  Laptop,
  LockKeyhole,
  MessageSquareText,
  SearchCheck,
} from "lucide-react";
import type { HelpIconName } from "@/lib/help/content";

const helpIcons = {
  applications: BarChart3,
  bot: Bot,
  briefcase: BriefcaseBusiness,
  file: FileText,
  globe: Globe2,
  key: KeyRound,
  laptop: Laptop,
  lock: LockKeyhole,
  message: MessageSquareText,
  search: SearchCheck,
};

export function getHelpIcon(icon: HelpIconName) {
  return helpIcons[icon];
}
