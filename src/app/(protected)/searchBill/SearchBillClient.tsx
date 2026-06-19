"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { getSalesFilteredAction } from "@/actions/sales/filtered";
import { getLatestSaleAction } from "@/actions/sales/get-latest";
import type BillState from "@/models/BillState";
import SearchBillHeader from "./components/SearchBillHeader";
import SearchBillFilters from "./components/SearchBillFilters";
import SearchBillList from "./components/SearchBillList";
import SearchBillPagination from "./components/SearchBillPagination";
import Spinner from "@/components/ui/Spinner";

interface Filters {
  seller: string;
  startDate: Date | null;
  endDate: Date | null;
  saleTypes: string[];
  paymentMethods: string[];
}

interface SalesResponse {
  sales: BillState[];
  nextCursor: string | null;
  hasMore: boolean;
  totalCount: number;
  stats: {
    totalSales: number;
    totalToday: number;
    todayCount: number;
  };
}

const ITEMS_PER_PAGE = 10;

export default function SearchBillClient() {
  const [sales, setSales] = useState<BillState[]>([]);
  const [stats, setStats] = useState({ 
    totalSales: 0, 
    totalToday: 0, 
    todayCount: 0, 
    orderCount: 0 
  });
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<Filters>({ 
    seller: "", 
    startDate: null, 
    endDate: null,
    saleTypes: [],
    paymentMethods: []
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [businessId, setBusinessId] = useState<string | null>(null);
  
  // Track if initial load is done
  const isInitialLoad = useRef(true);
  
  // Use refs to avoid stale closures
  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  
  // Loading ref to prevent duplicate calls
  const loadingRef = useRef(false);

  // Refs for real-time updates to avoid stale closures
  const statsRef = useRef(stats);
  statsRef.current = stats;
  
  // Debounce ref for real-time updates
  const realtimeDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const lastRealtimeUpdateRef = useRef<number>(0);
  
  // Track if user is viewing page 1 (only page 1 shows latest)
  const isOnPageOne = currentPage === 1;
  const isOnPageOneRef = useRef(true);
  isOnPageOneRef.current = isOnPageOne;
  
  // Store cursors by page number for proper navigation
  const cursorsByPage = useRef<Map<number, string>>(new Map());
  
  // Store current sale IDs to avoid duplicates
  const saleIdsRef = useRef<Set<string>>(new Set());

  // Fetch businessId from session on mount
  useEffect(() => {
    const fetchSession = async () => {
      try {
        setBusinessId("placeholder");
      } catch (e) {
        console.error("Error fetching session:", e);
      }
    };
    fetchSession();
  }, []);

  // Load sales and stats using unified action
  const loadData = useCallback(async (
    cursorToLoad: string | undefined | null, 
    pageNum: number = 1, 
    append: boolean = false,
    resetStats: boolean = true
  ) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    
    try {
      const f = filtersRef.current;
      const result: SalesResponse = await getSalesFilteredAction(
        cursorToLoad ?? undefined, 
        ITEMS_PER_PAGE,
        f.startDate || undefined,
        f.endDate || undefined,
        f.seller || undefined,
        f.saleTypes,
        f.paymentMethods
      );
      
      // Store the cursor for the NEXT page
      if (result.nextCursor && !append) {
        cursorsByPage.current.set(pageNum + 1, result.nextCursor);
      }

      if (append) {
        // Filter out duplicates
        const newSales = result.sales.filter(s => !saleIdsRef.current.has(s.id));
        newSales.forEach(s => saleIdsRef.current.add(s.id));
        setSales(prev => [...prev, ...newSales]);
      } else {
        // Reset and set new sales
        saleIdsRef.current = new Set(result.sales.map(s => s.id));
        setSales(result.sales);
      }
      
      setHasMore(result.hasMore);
      
      // Only update stats if requested (initial load or filter change)
      // For pagination, keep existing stats
      if (resetStats) {
        setStats({
          totalSales: result.stats.totalSales,
          totalToday: result.stats.totalToday,
          todayCount: result.stats.todayCount,
          orderCount: result.totalCount
        });
      }
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, []);

  // Initial data load
  useEffect(() => {
    if (isInitialLoad.current && businessId) {
      isInitialLoad.current = false;
      loadData(undefined, 1, false, true);
    }
  }, [businessId, loadData]);

  // Handle filter changes from child component
  const handleFilterApply = useCallback((newFilters: Filters) => {
    // Create a stable comparison string
    const newFiltersStr = JSON.stringify({
      seller: newFilters.seller || "",
      startDate: newFilters.startDate?.toISOString() || null,
      endDate: newFilters.endDate?.toISOString() || null,
      saleTypes: newFilters.saleTypes || [],
      paymentMethods: newFilters.paymentMethods || [],
    });
    
    const currentFiltersStr = JSON.stringify({
      seller: filtersRef.current.seller || "",
      startDate: filtersRef.current.startDate?.toISOString() || null,
      endDate: filtersRef.current.endDate?.toISOString() || null,
      saleTypes: filtersRef.current.saleTypes || [],
      paymentMethods: filtersRef.current.paymentMethods || [],
    });
    
    // Skip if filters are exactly the same
    if (newFiltersStr === currentFiltersStr) {
      return;
    }
    
    // Reset pagination state when filters change
    setFilters(newFilters);
    setSales([]);
    setCurrentPage(1);
    setHasMore(false);
    cursorsByPage.current.clear();
    saleIdsRef.current.clear();
    
    // Load with new filters (page 1)
    loadData(undefined, 1, false, true);
  }, [loadData]);

  // Handle pagination - use stored cursor or reset to page 1
  const handlePageChange = useCallback((page: number) => {
    if (page < 1) return;
    
    // Page 1 - always load from the beginning (no cursor)
    if (page === 1) {
      setCurrentPage(page);
      loadData(undefined, page, false, true);
    } else {
      // For page 2+, get the stored cursor from the PREVIOUS page
      const prevCursor = cursorsByPage.current.get(page);
      
      if (prevCursor || page === 2) {
        setCurrentPage(page);
        loadData(prevCursor, page, false, false);
      }
    }
  }, [loadData]);

  // Handle delete callback - reload data after delete
  const handleDeleted = useCallback(() => {
    // Reset to page 1 and reload
    setCurrentPage(1);
    cursorsByPage.current.clear();
    saleIdsRef.current.clear();
    loadData(undefined, 1, false, true);
  }, [loadData]);

  // Real-time update: add latest sale and update stats incrementally
  const handleRealtimeUpdate = useCallback(async () => {
    // Debounce: minimum 2 seconds between updates
    const now = Date.now();
    if (now - lastRealtimeUpdateRef.current < 2000) {
      return;
    }
    lastRealtimeUpdateRef.current = now;
    
    try {
      // Get the latest sale only
      const result = await getLatestSaleAction();
      
      if (result.error || !result.sale) {
        return;
      }
      
      const latestSale = result.sale;
      const latestTotal = result.total ?? 0;
      
      // Only add if we're on page 1 and don't already have it
      if (isOnPageOneRef.current && !saleIdsRef.current.has(latestSale.id)) {
        // Add to beginning of list
        setSales(prev => {
          // Avoid duplicates
          if (prev.some(s => s.id === latestSale.id)) {
            return prev;
          }
          return [latestSale, ...prev.slice(0, ITEMS_PER_PAGE - 1)];
        });
        saleIdsRef.current.add(latestSale.id);
      }
      
      // Update stats incrementally (add new sale totals)
      setStats(prev => ({
        ...prev,
        totalSales: prev.totalSales + latestTotal,
        totalToday: prev.totalToday + latestTotal,
        todayCount: prev.todayCount + 1,
        orderCount: prev.orderCount + 1,
      }));
      
    } catch (error) {
      console.error("Error in real-time update:", error);
    }
  }, []);

  // Pusher subscription for real-time updates
  useEffect(() => {
    if (!businessId || typeof window === "undefined") return;

    let channelName = "";

    const setupPusher = async () => {
      const { pusherClient } = await import("@/lib/pusher-client");
      
      channelName = `orders-${businessId}`;
      const channel = pusherClient.subscribe(channelName);
      
      // Use debounced handler for real-time updates
      const handleNewOrder = () => {
        // Clear existing timeout to debounce
        if (realtimeDebounceRef.current) {
          clearTimeout(realtimeDebounceRef.current);
        }
        
        // Debounce the update by 500ms to batch rapid events
        realtimeDebounceRef.current = setTimeout(() => {
          handleRealtimeUpdate();
        }, 500);
      };

      channel.bind("orders-update", handleNewOrder);
    };

    setupPusher();

    return () => {
      if (realtimeDebounceRef.current) {
        clearTimeout(realtimeDebounceRef.current);
      }
      if (channelName) {
        import("@/lib/pusher-client").then(({ pusherClient }) => {
          pusherClient.unsubscribe(channelName);
        });
      }
    };
  }, [businessId, handleRealtimeUpdate]);

  // Calculate total pages
  const totalPages = Math.ceil(stats.orderCount / ITEMS_PER_PAGE) || 1;

  return (
    <div className="flex flex-col gap-6 w-full max-w-5xl mx-auto">
      <SearchBillHeader 
        totalSales={stats.totalSales} 
        orderCount={stats.orderCount}
        totalToday={stats.totalToday}
        todayCount={stats.todayCount}
      />
      <SearchBillFilters onApply={handleFilterApply} />
      <div className="relative min-h-[200px]">
        {loading && (
          <div className="bg-white/80 flex items-center justify-center">
            <Spinner />
          </div>
        )}
        <SearchBillList sales={sales} onDeleted={handleDeleted} />
      </div>
      <SearchBillPagination 
        currentPage={currentPage}
        totalPages={totalPages}
        hasMore={hasMore}
        onPageChange={handlePageChange}
        loading={loading}
        totalItems={stats.orderCount}
      />
    </div>
  );
}