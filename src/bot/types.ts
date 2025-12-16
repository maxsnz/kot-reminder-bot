import { UserService } from "@/services/user.service";
import { ChatMessageService } from "@/services/chatMessage.service";
import { FocusService } from "@/services/focus.service";
import { ScheduleService } from "@/services/schedule.service";
import { AiRequestService } from "@/services/aiRequest.service";
import { GraphileWorkerService } from "@/services/graphileWorker.service";
import { SettingService } from "@/services/setting.service";

export interface BotDependencies {
  userService: UserService;
  telegramToken: string;
  chatMessageService: ChatMessageService;
  focusService: FocusService;
  scheduleService: ScheduleService;
  aiRequestService: AiRequestService;
  graphileWorkerService: GraphileWorkerService;
  settingService: SettingService;
}

export interface HandlerContext {
  chatId: number;
  userId?: string;
  messageText?: string;
}
