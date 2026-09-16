import { financeReportResponse } from "@/infrastructure/http/financeReportResponse";

export const GET = (request: Request) => financeReportResponse(request, "csv");
