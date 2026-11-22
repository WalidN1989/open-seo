import { useQuery } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { getSerpAnalysis } from "@/serverFunctions/keywords";

export function useKeywordSerpAnalysis(
  projectId: string,
  locationCode: number | undefined,
) {
  const [serpKeyword, setSerpKeywordState] = useState<string | null>(null);
  const [serpPage, setSerpPage] = useState(0);
  const SERP_PAGE_SIZE = 10;
  const [depth, setDepth] = useState<20 | 100>(20);
  const setSerpKeyword = useCallback((keyword: string | null) => {
    setSerpKeywordState(keyword);
    setDepth(20);
    setSerpPage(0);
  }, []);

  const serpQuery = useQuery({
    queryKey: ["serpAnalysis", projectId, serpKeyword, locationCode, depth],
    queryFn: () =>
      getSerpAnalysis({
        data: {
          projectId,
          keyword: serpKeyword!,
          locationCode,
          depth,
        },
      }),
    enabled: !!serpKeyword,
    staleTime: 12 * 60 * 60 * 1000,
    retry: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  });

  const serpResults = serpQuery.data?.items ?? [];
  const activeSerpKeyword =
    serpKeyword ?? serpQuery.data?.requestedKeyword ?? null;
  const serpLoading = !!serpKeyword && serpQuery.isLoading;
  const serpError = serpQuery.isError
    ? getStandardErrorMessage(serpQuery.error, "Failed to load SERP data.")
    : null;

  return {
    serpKeyword,
    setSerpKeyword,
    serpPage,
    setSerpPage,
    SERP_PAGE_SIZE,
    serpQuery,
    retrySerp: () => {
      if (depth === 100) {
        setDepth(20);
        setSerpPage(0);
      } else void serpQuery.refetch();
    },
    canLoadMoreSerp: depth < 100,
    loadMoreSerp: () => {
      if (
        window.confirm(
          "Fetch the top 100 results? This purchases a deeper SERP snapshot and uses additional credits.",
        )
      ) {
        setDepth(100);
        setSerpPage(0);
      }
    },
    serpResults,
    activeSerpKeyword,
    serpLoading,
    serpError,
  };
}
