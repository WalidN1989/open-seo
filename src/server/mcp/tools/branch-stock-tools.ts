import type { McpModuleSurface } from "@/server/mcp/module-registry";
import { z } from "zod";
import { BranchService } from "@/server/features/commerce/services/BranchService";
import { CommerceService } from "@/server/features/commerce/services/CommerceService";
import { mcpResponse } from "@/server/mcp/formatters";
import { withMcpOrganizationAuth } from "@/server/mcp/organization-auth";
import { optionalMetaOutputSchema } from "@/server/mcp/output-schemas";

const inputSchema = {
  organizationId: z
    .string()
    .min(1)
    .optional()
    .describe("Workspace; optional when the account belongs to only one."),
  search: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .describe(
      "Product name or SKU. Use a specific product, not the customer's location.",
    ),
  location: z
    .string()
    .trim()
    .max(200)
    .optional()
    .describe(
      "Optional branch name, city, state, postcode or address text. Omit to compare all branches. Australian state names and abbreviations both work. This is text matching, not distance ranking.",
    ),
};

const australianStates = new Map([
  ["victoria", "vic"],
  ["new south wales", "nsw"],
  ["queensland", "qld"],
  ["western australia", "wa"],
  ["south australia", "sa"],
  ["tasmania", "tas"],
  ["northern territory", "nt"],
  ["australian capital territory", "act"],
]);
function stateMatches(
  state: string | null,
  location: string,
  country: string | null,
) {
  if (
    !state ||
    (country && !["australia", "au"].includes(country.toLowerCase()))
  )
    return false;
  const normalized = state.toLowerCase().trim();
  return (
    (australianStates.get(normalized) ?? normalized) ===
    (australianStates.get(location) ?? location)
  );
}
const stockOutputSchema = z.object({
  id: z.string(),
  name: z.string(),
  address: z.string().nullable(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  postcode: z.string().nullable(),
  country: z.string().nullable(),
  phone: z.string().nullable(),
  openingHours: z.string().nullable(),
  quantityOnHand: z
    .number()
    .nullable()
    .describe("null means unknown; zero is confirmed out of stock."),
  availability: z.enum(["unknown", "in_stock", "out_of_stock"]),
  updatedAt: z.string().nullable(),
});

export const branchStockTool = {
  name: "find_branch_stock",
  config: {
    title: "Find product availability by branch",
    description:
      "Read live product stock and branch addresses before telling a customer where an item is available. Returns up to five matching products and twenty branches per product, including zero and unknown stock. null quantity means unknown, never out of stock. Ask which product if matches are ambiguous. No matching branches means the location was not matched, not that the product is out of stock; retry without location. Narrow search or location if totals exceed returned rows. Does not reserve stock or calculate the nearest branch. No provider calls or credits.",
    inputSchema,
    outputSchema: {
      products: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          sku: z.string(),
          inventoryMode: z.enum(["single", "multi"]),
          totalBranches: z.number(),
          availabilitySummary: z.enum([
            "unknown",
            "out_of_stock",
            "default_location",
            "some_branches",
            "all_branches",
          ]),
          availableBranchNames: z.array(z.string()),
          branches: z.array(stockOutputSchema),
        }),
      ),
      totalProducts: z.number(),
      ...optionalMetaOutputSchema,
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpOrganizationAuth(
    async (args: z.infer<z.ZodObject<typeof inputSchema>>, context) => {
      const parsed = z.object(inputSchema).parse(args);
      const result = await CommerceService.listProducts(
        context.organizationId,
        context.auth.userId,
        { search: parsed.search, status: "active", limit: 5, offset: 0 },
      );
      const products = await Promise.all(
        result.products.map(async (product) => {
          const stock = await BranchService.productStock(
            context.organizationId,
            context.auth.userId,
            product.id,
          );
          const location = parsed.location?.toLowerCase();
          const matching = stock.branches.filter(
            ({ branch }) =>
              !location ||
              stateMatches(branch.state, location, branch.country) ||
              [
                branch.name,
                branch.address,
                branch.city,
                branch.state,
                branch.postcode,
                branch.country,
              ].some((value) => value?.toLowerCase().includes(location)),
          );
          const available = matching.filter(
            ({ quantityOnHand }) => (quantityOnHand ?? 0) > 0,
          );
          const hasUnknown = matching.some(
            ({ quantityOnHand }) => quantityOnHand === null,
          );
          const availabilitySummary =
            matching.length === 0 || (available.length === 0 && hasUnknown)
              ? "unknown"
              : available.length === 0
                ? "out_of_stock"
                : product.inventoryMode === "single"
                  ? "default_location"
                  : available.length === matching.length
                    ? "all_branches"
                    : "some_branches";
          return {
            id: product.id,
            name: product.name,
            sku: product.sku,
            inventoryMode: product.inventoryMode,
            totalBranches: matching.length,
            availabilitySummary,
            availableBranchNames: available.map(({ branch }) => branch.name),
            branches: matching
              .slice(0, 20)
              .map(({ branch, quantityOnHand, updatedAt }) => ({
                id: branch.id,
                name: branch.name,
                address: branch.address,
                city: branch.city,
                state: branch.state,
                postcode: branch.postcode,
                country: branch.country,
                phone: branch.phone,
                openingHours: branch.openingHours,
                quantityOnHand,
                availability:
                  quantityOnHand === null
                    ? "unknown"
                    : quantityOnHand > 0
                      ? "in_stock"
                      : "out_of_stock",
                updatedAt,
              })),
          };
        }),
      );
      const body = { products, totalProducts: result.total };
      return mcpResponse({
        text: JSON.stringify(body),
        structuredContent: body,
      });
    },
  ),
};

export const commerceSurface: McpModuleSurface = {
  key: "crm",
  scope: "organization",
  summary: "Read live product availability and addresses by branch.",
  tools: [branchStockTool],
  withheld: [
    {
      action: "adjust, transfer or reserve stock",
      because: "Stock changes require a person using the inventory controls.",
    },
  ],
};
