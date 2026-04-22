"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { getSalesFilteredAction } from "@/actions/sales/filtered";
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
  const [stats, setStats] = useState({ totalSales: 0, totalToday: 0, todayCount: 0, orderCount: 0 });
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

  // Store cursors by page number for proper navigation
  // cursorsByPage.get(1) = cursor to load page 2
  // cursorsByPage.get(2) = cursor to load page 3, etc.
  const cursorsByPage = useRef<Map<number, string>>(new Map());
  
  // Current page data ref to track what's loaded
  const pageDataRef = useRef({
    page1: null as SalesResponse | null,
    currentPage: 1,
    lastFetchedAt: 0,
  });

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
  const loadData = useCallback(async (cursorToLoad: string | undefined | null, pageNum: number = 1, append: boolean = false) => {
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
      
      // Store the cursor for the NEXT page (current page + 1)
      // This cursor will be used to load the next page
      if (result.nextCursor && !append) {
        cursorsByPage.current.set(pageNum + 1, result.nextCursor);
      }

      if (append) {
        setSales(prev => [...prev, ...result.sales]);
      } else {
        setSales(result.sales);
      }
      
      setHasMore(result.hasMore);
      setStats({
        totalSales: result.stats.totalSales,
        totalToday: result.stats.totalToday,
        todayCount: result.stats.todayCount,
        orderCount: result.totalCount
      });

      // Store current response for potential reuse
      pageDataRef.current = {
        page1: result,
        currentPage: pageNum,
        lastFetchedAt: Date.now(),
      };
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, []);

  // Initial data load
  useEffect(() => {
    if (isInitialLoad.current && businessId) {
      isInitialLoad.current = false;
      loadData(undefined, 1);
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
    cursorsByPage.current.clear();
    pageDataRef.current = { page1: null, currentPage: 1, lastFetchedAt: 0 };
    
    // Load with new filters (page 1)
    loadData(undefined, 1);
  }, [loadData]);

  // Handle pagination - use stored cursor or reset to page 1
  const handlePageChange = useCallback((page: number) => {
    if (page < 1) return;
    
    // Page 1 - always load from the beginning (no cursor)
    if (page === 1) {
      setCurrentPage(page);
      loadData(undefined, page);
    } else {
      // For page 2+, get the stored cursor from the PREVIOUS page
      // cursorsByPage.get(page) gives us the cursor that was stored when we loaded (page-1)
      // That cursor leads to the next page which is 'page'
      const prevCursor = cursorsByPage.current.get(page);
      
      if (prevCursor || page === 2) {
        setCurrentPage(page);
        loadData(prevCursor, page);
      }
    }
  }, [loadData]);

  // Handle delete callback - reload data after delete
  const handleDeleted = useCallback(() => {
    // Reset to page 1 and reload
    setCurrentPage(1);
    cursorsByPage.current.clear();
    loadData(undefined, 1);
  }, [loadData]);

  // Pusher subscription for real-time updates
  useEffect(() => {
    if (!businessId || typeof window === "undefined") return;

    let channelName = "";

    const setupPusher = async () => {
      const { pusherClient } = await import("@/lib/pusher-client");
      
      channelName = `orders-${businessId}`;
      const channel = pusherClient.subscribe(channelName);
      
      const handleNewOrder = () => {
        // Only refresh on new orders
        loadData(undefined, 1);
      };

      channel.bind("orders-update", handleNewOrder);
    };

    setupPusher();

    return () => {
      if (channelName) {
        import("@/lib/pusher-client").then(({ pusherClient }) => {
          pusherClient.unsubscribe(channelName);
        });
      }
    };
  }, [businessId, loadData]);

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