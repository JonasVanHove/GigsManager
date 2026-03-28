export const openApiDocument = {
  openapi: "3.0.3",
  info: {
    title: "GigsManager API",
    version: "1.8.0",
    description:
      "REST API for managing gigs, reports, members, and health metrics in GigsManager.",
  },
  servers: [
    {
      url: "/",
      description: "Current deployment",
    },
  ],
  tags: [
    { name: "Health" },
    { name: "Metrics" },
    { name: "Gigs" },
    { name: "Reports" },
    { name: "Debug" },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
      },
    },
    schemas: {
      ErrorResponse: {
        type: "object",
        properties: {
          error: { type: "string" },
          details: { type: "string" },
        },
      },
      Gig: {
        type: "object",
        properties: {
          id: { type: "string" },
          eventName: { type: "string" },
          performers: { type: "string" },
          date: { type: "string", format: "date-time" },
          performanceFee: { type: "number" },
          technicalFee: { type: "number" },
          paymentReceived: { type: "boolean" },
          bandPaid: { type: "boolean" },
        },
      },
      GigsListResponse: {
        type: "object",
        properties: {
          data: {
            type: "array",
            items: { $ref: "#/components/schemas/Gig" },
          },
          total: { type: "number" },
          take: { type: "number" },
          skip: { type: "number" },
        },
      },
      BulkUpdateRequest: {
        type: "object",
        required: ["updates"],
        properties: {
          updates: {
            type: "array",
            items: {
              type: "object",
              required: ["id", "updates"],
              properties: {
                id: { type: "string" },
                updates: {
                  type: "object",
                  additionalProperties: true,
                },
              },
            },
          },
        },
      },
      FinancialReportResponse: {
        type: "object",
        properties: {
          summary: { type: "object", additionalProperties: true },
          monthlyBreakdown: {
            type: "array",
            items: { type: "object", additionalProperties: true },
          },
          gigs: {
            type: "array",
            items: { type: "object", additionalProperties: true },
          },
        },
      },
      HealthResponse: {
        type: "object",
        properties: {
          status: { type: "string" },
          database: { type: "string" },
          latencyMs: { type: "number" },
          timestamp: { type: "string", format: "date-time" },
        },
      },
      DebugTokenRequest: {
        type: "object",
        required: ["token"],
        properties: {
          token: { type: "string" },
        },
      },
    },
  },
  paths: {
    "/api/health": {
      get: {
        tags: ["Health"],
        summary: "Basic health check",
        responses: {
          "200": {
            description: "Healthy",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/HealthResponse" },
              },
            },
          },
          "503": {
            description: "Unhealthy",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
        },
      },
    },
    "/api/health/metrics": {
      get: {
        tags: ["Metrics"],
        summary: "Performance metrics summary",
        parameters: [
          {
            in: "query",
            name: "detailed",
            required: false,
            schema: { type: "boolean" },
            description: "Return recent raw metrics and vitals when true",
          },
        ],
        responses: {
          "200": {
            description: "Metrics payload",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  additionalProperties: true,
                },
              },
            },
          },
        },
      },
    },
    "/api/gigs": {
      get: {
        tags: ["Gigs"],
        summary: "List gigs (paginated)",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            in: "query",
            name: "take",
            schema: { type: "integer", minimum: 1, maximum: 200 },
            required: false,
          },
          {
            in: "query",
            name: "skip",
            schema: { type: "integer", minimum: 0 },
            required: false,
          },
        ],
        responses: {
          "200": {
            description: "List of gigs",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/GigsListResponse" },
              },
            },
          },
          "401": {
            description: "Unauthorized",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
        },
      },
    },
    "/api/gigs/{id}": {
      get: {
        tags: ["Gigs"],
        summary: "Get single gig",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            in: "path",
            name: "id",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            description: "Gig",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Gig" },
              },
            },
          },
          "404": { description: "Not found" },
        },
      },
      put: {
        tags: ["Gigs"],
        summary: "Update gig",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            in: "path",
            name: "id",
            required: true,
            schema: { type: "string" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                additionalProperties: true,
              },
            },
          },
        },
        responses: {
          "200": { description: "Updated" },
          "401": { description: "Unauthorized" },
          "404": { description: "Not found" },
        },
      },
      delete: {
        tags: ["Gigs"],
        summary: "Delete gig",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            in: "path",
            name: "id",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": { description: "Deleted" },
          "401": { description: "Unauthorized" },
          "404": { description: "Not found" },
        },
      },
    },
    "/api/gigs/bulk-update": {
      patch: {
        tags: ["Gigs"],
        summary: "Bulk update gigs",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/BulkUpdateRequest" },
            },
          },
        },
        responses: {
          "200": { description: "Bulk update result" },
          "400": { description: "Invalid payload" },
          "401": { description: "Unauthorized" },
        },
      },
    },
    "/api/reports/financial": {
      get: {
        tags: ["Reports"],
        summary: "Generate financial report",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            in: "query",
            name: "startDate",
            schema: { type: "string", format: "date" },
          },
          {
            in: "query",
            name: "endDate",
            schema: { type: "string", format: "date" },
          },
          {
            in: "query",
            name: "period",
            schema: {
              type: "string",
              enum: ["month", "quarter", "year", "all"],
            },
          },
        ],
        responses: {
          "200": {
            description: "Financial report",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/FinancialReportResponse" },
              },
            },
          },
          "401": { description: "Unauthorized" },
        },
      },
    },
    "/api/debug/token": {
      post: {
        tags: ["Debug"],
        summary: "Validate a bearer token",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/DebugTokenRequest" },
            },
          },
        },
        responses: {
          "200": {
            description: "Token validation result",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  additionalProperties: true,
                },
              },
            },
          },
        },
      },
    },
  },
} as const;
