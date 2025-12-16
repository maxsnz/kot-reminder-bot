import {
  PrismaClient,
  AiRequest,
  AiRequestStatus,
  Prisma,
} from "@/prisma/generated/client";

export interface CreateAiRequestParams {
  userId: string;
  prompt: any; // JSON object with all request data
}

export interface UpdateAiRequestResponseParams {
  responseText?: string | null;
  responseJson?: any | null;
  modelName?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
  cost?: Prisma.Decimal | number | string | null;
  elapsedTime?: number | null;
}

export class AiRequestService {
  constructor(private prisma: PrismaClient) {}

  // Create a new AI request
  async create(params: CreateAiRequestParams): Promise<AiRequest> {
    return this.prisma.aiRequest.create({
      data: {
        userId: params.userId,
        status: AiRequestStatus.queued,
        prompt: params.prompt,
      },
    });
  }

  // Find AI request by ID
  async findById(id: string): Promise<AiRequest | null> {
    return this.prisma.aiRequest.findUnique({
      where: { id },
      include: {
        user: true,
      },
    });
  }

  // Update status
  async updateStatus(
    id: string,
    status: AiRequestStatus,
    startedAt?: Date | null,
    finishedAt?: Date | null
  ): Promise<AiRequest> {
    const updateData: any = { status };
    if (startedAt !== undefined) {
      updateData.startedAt = startedAt;
    }
    if (finishedAt !== undefined) {
      updateData.finishedAt = finishedAt;
    }

    return this.prisma.aiRequest.update({
      where: { id },
      data: updateData,
    });
  }

  // Mark as processing
  async markProcessing(id: string): Promise<AiRequest> {
    return this.updateStatus(id, AiRequestStatus.processing, new Date(), null);
  }

  // Mark as succeeded
  async markSucceeded(
    id: string,
    responseParams: UpdateAiRequestResponseParams
  ): Promise<AiRequest> {
    return this.prisma.aiRequest.update({
      where: { id },
      data: {
        status: AiRequestStatus.succeeded,
        finishedAt: new Date(),
        responseText: responseParams.responseText ?? null,
        responseJson: responseParams.responseJson ?? null,
        modelName: responseParams.modelName ?? null,
        inputTokens: responseParams.inputTokens ?? null,
        outputTokens: responseParams.outputTokens ?? null,
        totalTokens: responseParams.totalTokens ?? null,
        cost: responseParams.cost ?? null,
        elapsedTime: responseParams.elapsedTime ?? null,
      },
    });
  }

  // Mark as failed
  async markFailed(id: string, error: string): Promise<AiRequest> {
    return this.prisma.aiRequest.update({
      where: { id },
      data: {
        status: AiRequestStatus.failed,
        finishedAt: new Date(),
        error,
      },
    });
  }

  // Update response (for partial updates)
  async updateResponse(
    id: string,
    responseParams: UpdateAiRequestResponseParams
  ): Promise<AiRequest> {
    const updateData: any = {};

    if (responseParams.responseText !== undefined) {
      updateData.responseText = responseParams.responseText;
    }
    if (responseParams.responseJson !== undefined) {
      updateData.responseJson = responseParams.responseJson;
    }
    if (responseParams.modelName !== undefined) {
      updateData.modelName = responseParams.modelName;
    }
    if (responseParams.inputTokens !== undefined) {
      updateData.inputTokens = responseParams.inputTokens;
    }
    if (responseParams.outputTokens !== undefined) {
      updateData.outputTokens = responseParams.outputTokens;
    }
    if (responseParams.totalTokens !== undefined) {
      updateData.totalTokens = responseParams.totalTokens;
    }
    if (responseParams.cost !== undefined) {
      updateData.cost = responseParams.cost;
    }
    if (responseParams.elapsedTime !== undefined) {
      updateData.elapsedTime = responseParams.elapsedTime;
    }

    return this.prisma.aiRequest.update({
      where: { id },
      data: updateData,
    });
  }

  async getAiRequests(): Promise<AiRequest[]> {
    return this.prisma.aiRequest.findMany();
  }
}
