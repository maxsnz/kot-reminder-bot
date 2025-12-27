import OpenAI from "openai";
import fetch from "node-fetch";
import { HttpsProxyAgent } from "https-proxy-agent";
import { SCHEDULE_PROMPT, responseSchema } from "@/bot/prompt";
import { Response } from "@/bot/prompt";
import { Schedule } from "@/prisma/generated/client";
import { SettingService } from "./setting.service";
import { version } from "../../package.json";

export interface AIServiceDependencies {
  openaiApiKey: string;
  settingService: SettingService;
}

export interface ProcessMessageParams {
  userTime: string;
  messageText: string;
  context: string;
  schedule: Schedule | null;
}

export class AIService {
  private client: OpenAI;
  private settingService: SettingService;
  private proxyUrl: string | null = null;
  private openaiApiKey: string;

  constructor({ openaiApiKey, settingService }: AIServiceDependencies) {
    this.openaiApiKey = openaiApiKey;
    this.settingService = settingService;
    this.client = new OpenAI({
      apiKey: openaiApiKey,
      // @ts-expect-error
      fetch: this.createFetch(),
    });
    this.initializeProxy();
  }

  private createFetch() {
    return async (url: string, init?: any) => {
      const proxyUrl =
        this.proxyUrl || (await this.settingService.getValue("PROXY_URL"));
      if (proxyUrl) {
        const agent = new HttpsProxyAgent(proxyUrl);
        return fetch(url, { ...init, agent });
      }
      return fetch(url, init);
    };
  }

  private async initializeProxy() {
    const proxyUrl = await this.settingService.getValue("PROXY_URL");
    if (proxyUrl) {
      this.proxyUrl = proxyUrl;
      this.client = new OpenAI({
        apiKey: this.openaiApiKey,
        // @ts-expect-error
        fetch: this.createFetch(),
      });
    }
  }

  async updateProxyUrl(url: string) {
    this.proxyUrl = url;
    this.client = new OpenAI({
      apiKey: this.openaiApiKey,
      // @ts-expect-error
      fetch: this.createFetch(),
    });
  }

  async processMessage(prompt: string) {
    const response = await this.client.responses.create({
      model: "gpt-5-nano",
      prompt_cache_key: `schedule_prompt_${version}`,
      input: [
        {
          role: "system",
          content: SCHEDULE_PROMPT,
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      // prompt_cache_retention: "24h",
      text: {
        format: {
          name: responseSchema.json_schema.name,
          schema: responseSchema.json_schema.schema!!,
          type: responseSchema.type,
        },
      },
    });

    const parsedResponse = JSON.parse(response.output_text);
    // Validate response
    const validationResult = Response.safeParse(parsedResponse);
    if (!validationResult.success) {
      throw new Error(
        `Response validation failed: ${JSON.stringify(
          validationResult.error.issues
        )}`
      );
    }

    return {
      result: validationResult.data.result,
      usage: response.usage,
      model: response.model,
      fullResponse: response, // Full OpenAI API response for logging
    };
  }
}
