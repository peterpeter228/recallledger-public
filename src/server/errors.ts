export class ApiError extends Error {
 constructor(public code:string, public status=400, public details:Record<string,unknown>={}, public retryable=false) { super(code); }
}
