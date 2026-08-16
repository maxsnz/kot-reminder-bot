import { AiResultProcessor } from "./ai-result.processor";
import { AiRequest } from "@/prisma/generated/client";

const TZ = "Asia/Makassar";

function buildProcessor() {
  // Records the order in which the two timezone-change steps run. Ordering is
  // the whole point: re-syncing first would end a one_time schedule whose new
  // local time is already past, and the catch-up (which only looks at active
  // schedules) would then never see it.
  const calls: string[] = [];

  const deps = {
    userService: {
      findById: jest.fn().mockResolvedValue({
        id: "user-1",
        chatId: 123,
        username: "tester",
        timezone: "Europe/Moscow",
      }),
      setFocus: jest.fn().mockResolvedValue(undefined),
      updateUser: jest.fn().mockResolvedValue(undefined),
    },
    focusService: {
      findById: jest.fn().mockResolvedValue({ id: "focus-1" }),
      createFocus: jest.fn().mockResolvedValue({ id: "focus-1" }),
    },
    chatMessageService: {
      createMessage: jest.fn().mockResolvedValue(undefined),
      setFocus: jest.fn().mockResolvedValue(undefined),
    },
    scheduleService: {
      resyncAllForUser: jest.fn().mockImplementation(async () => {
        calls.push("resync");
      }),
      findActiveByUserId: jest.fn().mockResolvedValue([]),
    },
    scheduleActionProcessor: {
      processAction: jest.fn().mockResolvedValue(null),
    },
    messageService: {
      sendMessage: jest.fn().mockResolvedValue({ message_id: 1 }),
      sendMarkdownV2: jest.fn().mockResolvedValue({ message_id: 1 }),
    },
    reminderDeliveryService: {
      fireMissedForUser: jest.fn().mockImplementation(async () => {
        calls.push("catch-up");
      }),
    },
  };

  return { processor: new AiResultProcessor(deps as any), deps, calls };
}

function makeAiRequest(result: Record<string, unknown>): AiRequest {
  return {
    id: "ai-1",
    userId: "user-1",
    prompt: {
      chatId: 123,
      messageText: "Бали",
      focusId: "focus-1",
      userMessageId: "msg-1",
    },
    responseJson: result,
  } as unknown as AiRequest;
}

describe("AiResultProcessor — set_timezone", () => {
  afterEach(() => jest.restoreAllMocks());

  it("fires missed reminders before re-syncing worker jobs", async () => {
    const { processor, deps, calls } = buildProcessor();

    await processor.processResult(
      makeAiRequest({
        action: "set_timezone",
        timezone: TZ,
        focus: "current",
        response: `Ваша таймзона: ${TZ}`,
      })
    );

    expect(deps.userService.updateUser).toHaveBeenCalledWith("user-1", {
      timezone: TZ,
    });
    expect(calls).toEqual(["catch-up", "resync"]);
  });

  it("does neither for actions other than set_timezone", async () => {
    const { processor, deps } = buildProcessor();

    await processor.processResult(
      makeAiRequest({ action: "ask", focus: "current", response: "Когда?" })
    );

    expect(deps.reminderDeliveryService.fireMissedForUser).not.toHaveBeenCalled();
    expect(deps.scheduleService.resyncAllForUser).not.toHaveBeenCalled();
  });
});
