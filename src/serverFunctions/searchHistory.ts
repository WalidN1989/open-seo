import { createServerFn } from "@tanstack/react-start";
import { requireProjectContext } from "./middleware";
import { SearchHistoryRepository } from "@/server/features/search-history/repositories/SearchHistoryRepository";
import {
  addSearchHistorySchema,
  listSearchHistorySchema,
  removeSearchHistorySchema,
} from "@/types/schemas/search-history";

export const listSearchHistory = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(listSearchHistorySchema)
  .handler(({ context, data }) =>
    SearchHistoryRepository.list(context.projectId, data.module),
  );

export const addSearchHistory = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(addSearchHistorySchema)
  .handler(({ context, data }) =>
    SearchHistoryRepository.add({
      projectId: context.projectId,
      module: data.module,
      itemKey: data.itemKey,
      itemJson: JSON.stringify(data.item ?? null),
      ranByUserId: context.userId,
    }),
  );

export const removeSearchHistory = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(removeSearchHistorySchema)
  .handler(({ context, data }) =>
    SearchHistoryRepository.remove(
      context.projectId,
      data.module,
      data.itemKey,
    ),
  );

export const clearSearchHistory = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(listSearchHistorySchema)
  .handler(({ context, data }) =>
    SearchHistoryRepository.clear(context.projectId, data.module),
  );
