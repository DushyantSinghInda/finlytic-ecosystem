import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { AuthenticatedUser } from "./types";
import type { Request } from "express";

export const CurrentUser = createParamDecorator(
    (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
        const request = context.switchToHttp().getRequest<Request>();
        return request.user!;
    }
)