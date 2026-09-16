/**
 * Shared FR7 /api/finance/* error → Response + safe server logging.
 * Client 500s stay generic in Production. Classification is server-only.
 */

import { UnauthorizedError } from "@/infrastructure/http/apiAuth";
import { AuthorizationError } from "@/permissions/guards";
import { mapFinanceApiError } from "@/application/finance/reporting/getFinanceReportingReadService";
import {
  classifyFinanceReportingFailure,
  financeReportingClientErrorMessage,
} from "@/infrastructure/finance/financeReportingFailureClassification";
import { logger } from "@/infrastructure/logging/logger";

export function financeReportingApiErrorResponse(error: unknown): Response {
  if (error instanceof UnauthorizedError) {
    return Response.json(
      { error: error.message, code: error.code },
      { status: 401 },
    );
  }
  if (error instanceof AuthorizationError) {
    return Response.json(
      { error: error.message, code: error.code },
      { status: 403 },
    );
  }

  const mapped = mapFinanceApiError(error);
  if (mapped.status === 403 || mapped.status === 400) {
    return Response.json(mapped.body, { status: mapped.status });
  }

  const classified = classifyFinanceReportingFailure(error);
  logger.error("finance_reporting_failure", {
    category: classified.category,
    code: classified.code,
    message: classified.sanitizedMessage,
  });

  return Response.json(
    {
      error: financeReportingClientErrorMessage(error),
      code: "INTERNAL",
    },
    { status: 500 },
  );
}
