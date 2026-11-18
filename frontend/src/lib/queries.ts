import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  api,
  type AppSettings,
  type Category,
  type ReadStatus,
  type ScanLog,
  type ScanStatus,
  type SeriesDetail,
  type SeriesPage,
  type Stats,
  type Tag,
} from "./api";
import { categoryColor } from "./format";

export interface SeriesFilters {
  category_id?: string;
  q?: string;
  status?: string;
  read?: string;
  favorite?: string;
  tag_id?: string;
  format?: string;
  sort?: string;
  order?: string;
}

const PAGE_SIZE = 60;

export function useCategories() {
  return useQuery({ queryKey: ["categories"], queryFn: () => api.get<Category[]>("/api/categories") });
}

/** Colour lookup by category id, using the category's configured order. */
export function useCategoryColor() {
  const { data } = useCategories();
  return (categoryId: number) => {
    const c = data?.find((x) => x.id === categoryId);
    return categoryColor(c ? c.sort_order : 0);
  };
}

export function useSeriesList(filters: SeriesFilters) {
  return useInfiniteQuery({
    queryKey: ["series", filters],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => {
      const p = new URLSearchParams();
      Object.entries(filters).forEach(([k, v]) => v && p.set(k, v));
      p.set("page", String(pageParam));
      p.set("page_size", String(PAGE_SIZE));
      return api.get<SeriesPage>(`/api/series?${p}`);
    },
    getNextPageParam: (last) => (last.page * last.page_size < last.total ? last.page + 1 : undefined),
  });
}

export function useSeries(id: number) {
  return useQuery({ queryKey: ["series-detail", id], queryFn: () => api.get<SeriesDetail>(`/api/series/${id}`) });
}

export function useTags() {
  return useQuery({ queryKey: ["tags"], queryFn: () => api.get<Tag[]>("/api/tags") });
}

export function useStats() {
  return useQuery({ queryKey: ["stats"], queryFn: () => api.get<Stats>("/api/stats") });
}

export function useAppSettings() {
  return useQuery({ queryKey: ["settings"], queryFn: () => api.get<AppSettings>("/api/settings") });
}

export function useScanLogs() {
  return useQuery({ queryKey: ["scan-logs"], queryFn: () => api.get<ScanLog[]>("/api/scan/logs") });
}

export function useScanStatus() {
  const qc = useQueryClient();
  return useQuery({
    queryKey: ["scan-status"],
    queryFn: async () => {
      const s = await api.get<ScanStatus>("/api/scan/status");
      const prev = qc.getQueryData<ScanStatus>(["scan-status"]);
      if (prev?.running && !s.running) {
        // Scan just finished: refresh everything.
        qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== "scan-status" });
        if (s.phase === "done") toast.success(s.message || "掃描完成");
        if (s.phase === "error") toast.error(s.message || "掃描失敗");
      }
      return s;
    },
    refetchInterval: (q) => (q.state.data?.running || q.state.data?.covers.running ? 1000 : 10000),
  });
}

/** Invalidate everything that shows series data. */
function useRefreshLibrary() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["series"] });
    qc.invalidateQueries({ queryKey: ["series-detail"] });
    qc.invalidateQueries({ queryKey: ["stats"] });
    qc.invalidateQueries({ queryKey: ["categories"] });
    qc.invalidateQueries({ queryKey: ["tags"] });
  };
}

const onError = (e: Error) => toast.error(e.message);

export function usePatchSeries(id: number) {
  const qc = useQueryClient();
  const refresh = useRefreshLibrary();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => api.patch<SeriesDetail>(`/api/series/${id}`, body),
    onSuccess: (data) => {
      qc.setQueryData(["series-detail", id], data);
      refresh();
    },
    onError,
  });
}

export function useSetVolumeRead(seriesId: number) {
  const qc = useQueryClient();
  const refresh = useRefreshLibrary();
  return useMutation({
    mutationFn: ({ volumeId, status }: { volumeId: number; status: ReadStatus }) =>
      api.patch(`/api/volumes/${volumeId}`, { read_status: status }),
    onMutate: async ({ volumeId, status }) => {
      await qc.cancelQueries({ queryKey: ["series-detail", seriesId] });
      const prev = qc.getQueryData<SeriesDetail>(["series-detail", seriesId]);
      if (prev) {
        qc.setQueryData<SeriesDetail>(["series-detail", seriesId], {
          ...prev,
          volumes: prev.volumes.map((v) => (v.id === volumeId ? { ...v, read_status: status } : v)),
        });
      }
      return { prev };
    },
    onError: (e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["series-detail", seriesId], ctx.prev);
      onError(e);
    },
    onSettled: refresh,
  });
}

export function useSetSeriesRead(seriesId: number) {
  const refresh = useRefreshLibrary();
  return useMutation({
    mutationFn: (status: ReadStatus) => api.post(`/api/series/${seriesId}/read-status`, { read_status: status }),
    onSuccess: refresh,
    onError,
  });
}

export function useOpenVolume() {
  const refresh = useRefreshLibrary();
  return useMutation({
    mutationFn: (volumeId: number) => api.post(`/api/volumes/${volumeId}/open`),
    onSuccess: () => {
      toast.success("已在 SumatraPDF 開啟");
      refresh();
    },
    onError,
  });
}

export function useContinueSeries() {
  const refresh = useRefreshLibrary();
  return useMutation({
    mutationFn: (seriesId: number) => api.post(`/api/series/${seriesId}/continue`),
    onSuccess: () => {
      toast.success("已在 SumatraPDF 開啟");
      refresh();
    },
    onError,
  });
}

export function useRevealVolume() {
  return useMutation({ mutationFn: (volumeId: number) => api.post(`/api/volumes/${volumeId}/reveal`), onError });
}

export function useBatchSeries() {
  const refresh = useRefreshLibrary();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post<{ count: number }>("/api/series/batch", body),
    onSuccess: (r) => {
      toast.success(`已更新 ${r.count} 個系列`);
      refresh();
    },
    onError,
  });
}

export function useTagMutations() {
  const refresh = useRefreshLibrary();
  const opts = { onSuccess: refresh, onError };
  return {
    create: useMutation({ mutationFn: (b: { name: string; color: string }) => api.post<Tag>("/api/tags", b), ...opts }),
    update: useMutation({
      mutationFn: ({ id, ...b }: { id: number; name: string; color: string }) => api.patch<Tag>(`/api/tags/${id}`, b),
      ...opts,
    }),
    remove: useMutation({ mutationFn: (id: number) => api.del(`/api/tags/${id}`), ...opts }),
    merge: useMutation({
      mutationFn: ({ id, into }: { id: number; into: number }) => api.post(`/api/tags/${id}/merge`, { into_id: into }),
      ...opts,
    }),
  };
}

export function useStartScan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (mode: "incremental" | "full") => api.post("/api/scan", { mode }),
    onSuccess: () => {
      toast("開始掃描…");
      qc.invalidateQueries({ queryKey: ["scan-status"] });
    },
    onError,
  });
}

export function useRebuildCovers() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (failedOnly: boolean) => api.post("/api/covers/rebuild", { failed_only: failedOnly }),
    onSuccess: () => {
      toast("開始重建封面…");
      qc.invalidateQueries({ queryKey: ["scan-status"] });
    },
    onError,
  });
}
