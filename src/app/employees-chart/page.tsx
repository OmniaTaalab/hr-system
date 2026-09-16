
"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback, createContext, useContext } from 'react';
import { AppLayout, useUserProfile } from "@/components/layout/app-layout";
import { db } from '@/lib/firebase/config';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
  Loader2,
  AlertTriangle,
  GitBranch,
  ZoomIn,
  ZoomOut,
  FileDown,
  Maximize2,
  Users,
  Building2,
  Search,
  RotateCcw,
  ChevronsDownUp,
  ChevronsUpDown,
  UserRound,
} from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from "@/hooks/use-toast";
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { MultiSelectFilter } from '@/components/multi-select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface Employee {
  id: string;
  name: string;
  role: string;
  nisEmail: string;
  photoURL?: string;
  reportLine1?: string | null;
  campus?: string;
  title?: string;
  status?: "Active" | "deactivated";
  religion?: string;
  stage?: string;
  subordinates: Employee[];
}

type LevelTheme = {
  name: string;
  color: string;
  soft: string;
};

const LEVEL_THEMES: LevelTheme[] = [
  { name: "Leadership", color: "#1D4ED8", soft: "#DBEAFE" },
  { name: "Managers", color: "#7C3AED", soft: "#EDE9FE" },
  { name: "Team leads", color: "#0F766E", soft: "#CCFBF1" },
  { name: "Teams", color: "#EA580C", soft: "#FFEDD5" },
  { name: "Staff", color: "#DB2777", soft: "#FCE7F3" },
];

const CONNECTOR = "bg-slate-300 dark:bg-slate-600";

function getLevelTheme(level: number) {
  return LEVEL_THEMES[Math.min(level, LEVEL_THEMES.length - 1)];
}

function getInitials(name: string) {
  if (!name) return "?";
  return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
}

function getChartDisplayName(name: string, maxParts = 3) {
  if (!name) return "";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= maxParts) return name.trim();
  return parts.slice(0, maxParts).join(" ");
}

function countPeople(nodes: Employee[]): number {
  return nodes.reduce((sum, node) => sum + 1 + countPeople(node.subordinates), 0);
}

function collectExpandableIds(nodes: Employee[], acc = new Set<string>()): Set<string> {
  for (const node of nodes) {
    if (node.subordinates.length > 0) {
      acc.add(node.id);
      collectExpandableIds(node.subordinates, acc);
    }
  }
  return acc;
}

function getExpandIdsToDepth(nodes: Employee[], maxDepth: number, depth = 0, acc = new Set<string>()): Set<string> {
  if (depth >= maxDepth) return acc;
  for (const node of nodes) {
    if (node.subordinates.length > 0) {
      acc.add(node.id);
      getExpandIdsToDepth(node.subordinates, maxDepth, depth + 1, acc);
    }
  }
  return acc;
}

function collectSearchMatches(nodes: Employee[], query: string) {
  const matchedIds = new Set<string>();
  const expandIds = new Set<string>();

  const visit = (list: Employee[], ancestors: string[]) => {
    for (const node of list) {
      const path = [...ancestors, node.id];
      const haystack = `${node.name} ${node.title || ""} ${node.role || ""} ${node.campus || ""}`.toLowerCase();
      if (haystack.includes(query)) {
        matchedIds.add(node.id);
        ancestors.forEach(id => expandIds.add(id));
      }
      visit(node.subordinates, path);
    }
  };

  visit(nodes, []);
  return { matchedIds, expandIds };
}

type ChartUIValue = {
  expandedIds: Set<string>;
  toggleExpand: (id: string) => void;
  searchQuery: string;
  matchedIds: Set<string>;
  onEmployeeClick: (employee: Employee) => void;
};

const ChartUIContext = createContext<ChartUIValue | null>(null);

function useChartUI() {
  const value = useContext(ChartUIContext);
  if (!value) throw new Error("Chart UI context is missing");
  return value;
}

function EmployeeCard({ employee, level }: { employee: Employee; level: number }) {
  const { onEmployeeClick, matchedIds, searchQuery } = useChartUI();
  const displayName = getChartDisplayName(employee.name, 3);
  const jobTitle = employee.title || employee.role || "";
  const theme = getLevelTheme(level);
  const isMatch = matchedIds.has(employee.id);
  const isDimmed = Boolean(searchQuery) && matchedIds.size > 0 && !isMatch;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={() => onEmployeeClick(employee)}
          className={cn(
            "group w-52 shrink-0 cursor-pointer overflow-hidden rounded-xl border bg-white text-center shadow-sm transition-all duration-200",
            "hover:-translate-y-0.5 hover:shadow-lg",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            isMatch && "ring-2 shadow-md",
            isDimmed && "opacity-40"
          )}
          style={{
            borderColor: `${theme.color}55`,
            boxShadow: isMatch ? `0 8px 20px ${theme.color}33` : undefined,
          }}
        >
          <div className="h-2" style={{ backgroundColor: theme.color }} />
          <div className="flex flex-col items-center px-3 pb-4 pt-4" style={{ backgroundColor: theme.soft }}>
            <Avatar className="h-14 w-14 shrink-0 ring-2 ring-white">
              <AvatarImage src={employee.photoURL} alt={employee.name} />
              <AvatarFallback className="text-sm font-semibold text-white" style={{ backgroundColor: theme.color }}>
                {getInitials(employee.name)}
              </AvatarFallback>
            </Avatar>
            <p className="mt-2.5 w-full font-headline text-sm font-semibold leading-tight line-clamp-2">
              {displayName}
            </p>
            {jobTitle ? (
              <p className="mt-1 w-full text-[11px] leading-tight text-muted-foreground line-clamp-2">
                {jobTitle}
              </p>
            ) : null}
          </div>
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs">
        <p className="font-semibold">{employee.name}</p>
        {jobTitle && <p className="text-xs text-muted-foreground">{jobTitle}</p>}
      </TooltipContent>
    </Tooltip>
  );
}

function ExpandToggle({ employee }: { employee: Employee }) {
  const { expandedIds, toggleExpand } = useChartUI();
  const isExpanded = expandedIds.has(employee.id);
  const count = employee.subordinates.length;
  if (count === 0) return null;

  return (
    <button
      type="button"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        toggleExpand(employee.id);
      }}
      className={cn(
        "z-10 flex items-center gap-1 rounded-full border bg-card px-2 py-0.5 text-[11px] font-medium text-primary shadow-sm",
        "cursor-pointer transition-colors hover:bg-primary hover:text-primary-foreground"
      )}
      aria-expanded={isExpanded}
      aria-label={isExpanded ? `Hide ${count} reports` : `Show ${count} reports`}
    >
      {isExpanded ? <ChevronsUpDown className="h-3 w-3" /> : <ChevronsDownUp className="h-3 w-3" />}
      {count}
    </button>
  );
}

function EmployeeNode({
  employee,
  level,
  isRoot = false,
  isFirst = false,
  isLast = false,
  isOnly = true,
}: {
  employee: Employee;
  level: number;
  isRoot?: boolean;
  isFirst?: boolean;
  isLast?: boolean;
  isOnly?: boolean;
}) {
  const { expandedIds } = useChartUI();
  const hasKids = employee.subordinates.length > 0;
  const isExpanded = hasKids && expandedIds.has(employee.id);
  const kids = employee.subordinates;

  return (
    <div className="relative flex flex-col items-center px-4">
      {!isRoot && !isOnly && (
        <div
          className={cn(
            "absolute top-0 h-0.5",
            CONNECTOR,
            isFirst && "left-1/2 right-0",
            isLast && "left-0 right-1/2",
            !isFirst && !isLast && "left-0 right-0"
          )}
        />
      )}
      {!isRoot && <div className={cn("h-6 w-0.5 shrink-0", CONNECTOR)} />}

      <EmployeeCard employee={employee} level={level} />

      {hasKids && (
        <>
          <div className={cn("h-3 w-0.5 shrink-0", CONNECTOR)} />
          <ExpandToggle employee={employee} />
        </>
      )}

      {isExpanded && (
        <>
          <div className={cn("h-3 w-0.5 shrink-0", CONNECTOR)} />
          <div className="flex flex-row flex-nowrap items-start justify-center">
            {kids.map((child, index) => (
              <EmployeeNode
                key={child.id}
                employee={child}
                level={level + 1}
                isFirst={index === 0}
                isLast={index === kids.length - 1}
                isOnly={kids.length === 1}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

const MIN_ZOOM = 0.15;
const MAX_ZOOM = 3;

function clampZoom(zoom: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

function StatChip({
  icon: Icon,
  label,
  value,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2.5 rounded-xl border bg-card px-3 py-2 shadow-sm", className)}>
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <p className="text-lg font-headline font-semibold leading-none">{value}</p>
        <p className="text-[11px] text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

function EmployeesChartContent() {
  const [allEmployees, setAllEmployees] = useState<Employee[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { profile, loading: isLoadingProfile } = useUserProfile();
  const router = useRouter();
  const { toast } = useToast();

  const [campusFilter, setCampusFilter] = useState<string[]>([]);
  const [titleFilter, setTitleFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [religionFilter, setReligionFilter] = useState<string[]>([]);
  const [stageFilter, setStageFilter] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const [view, setView] = useState({ zoom: 1, x: 40, y: 40 });
  const [isPanning, setIsPanning] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const lastPointerRef = useRef({ x: 0, y: 0 });
  const dragDistanceRef = useRef(0);

const canViewPage =
  !isLoadingProfile &&
  profile &&
  (
    profile.role?.toLowerCase() === 'hr' ||
    profile.role?.toLowerCase() === 'director'||
    profile.role?.toLowerCase() === 'human resource director' ||
    profile.role?.toLowerCase() === 'human resource director international schools' ||
    profile.role?.toLowerCase() === 'personnal director' ||
    profile.role?.toLowerCase() === 'recruitment and onbording manager' ||
    profile.role?.toLowerCase() === 'human resource executive' ||
    profile.role?.toLowerCase() === 'recruitment and onboarding executive' ||
    profile.role?.toLowerCase() === 'personnel executive'
  );
  useEffect(() => {
    if (isLoadingProfile) return;

    if (!canViewPage) {
      router.replace('/');
      return;
    }

    const q = query(collection(db, "employee"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const employeesData: Employee[] = snapshot.docs.map(doc => {
        const data = doc.data() as Omit<Employee, "id" | "subordinates">;

        return {
          id: doc.id,
          subordinates: [],
          ...data,
        };
      });
      setAllEmployees(employeesData);
      setIsLoading(false);
    }, (error) => {
      console.error("Error fetching employees for chart: ", error);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [isLoadingProfile, canViewPage, router]);

  const { campusList, titleList, religionList, stageList } = useMemo(() => {
    const campusMap = new Map<string, string>();
    const titleMap = new Map<string, string>();
    const religionMap = new Map<string, string>();
    const stageMap = new Map<string, string>();

    allEmployees.forEach(e => {
      if (e.campus) {
        const trimmed = e.campus.trim();
        if (trimmed) campusMap.set(trimmed.toLowerCase(), trimmed);
      }
      if (e.title) {
        const trimmed = e.title.trim();
        if (trimmed) titleMap.set(trimmed.toLowerCase(), trimmed);
      }
      if (e.religion) {
        const trimmed = e.religion.trim();
        if (trimmed) religionMap.set(trimmed.toLowerCase(), trimmed);
      }
      if (e.stage) {
        const trimmed = e.stage.trim();
        if (trimmed) stageMap.set(trimmed.toLowerCase(), trimmed);
      }
    });

    const toOptions = (valueMap: Map<string, string>) =>
      Array.from(valueMap.values())
        .sort()
        .map(v => ({ label: v, value: v }));

    return {
      campusList: toOptions(campusMap),
      titleList: toOptions(titleMap),
      religionList: toOptions(religionMap),
      stageList: toOptions(stageMap),
    };
  }, [allEmployees]);

  const rootEmployees = useMemo(() => {
    const noFiltersApplied = campusFilter.length === 0 && titleFilter.length === 0 && statusFilter.length === 0 && religionFilter.length === 0 && stageFilter.length === 0;

    if (!allEmployees.length || noFiltersApplied) {
      return [];
    }

    const employees = allEmployees.map(emp => ({ ...emp, subordinates: [] as Employee[] }));
    const emailMap = new Map<string, Employee>();
    employees.forEach(emp => {
      if (emp.nisEmail) {
        emailMap.set(emp.nisEmail.toLowerCase(), emp);
      }
    });

    employees.forEach(employee => {
      if (employee.reportLine1) {
        const manager = emailMap.get(employee.reportLine1.toLowerCase());
        if (manager && manager.id !== employee.id) {
          manager.subordinates.push(employee);
        }
      }
    });

    employees.forEach(emp => {
      emp.subordinates.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    });

    let roots = employees;

    if (campusFilter.length > 0) roots = roots.filter(e => e.campus && campusFilter.includes(e.campus));
    if (titleFilter.length > 0) roots = roots.filter(e => e.title && titleFilter.includes(e.title));
    if (statusFilter.length > 0) {
      roots = roots.filter(e => {
        const status = e.status === 'deactivated' ? 'Deactivated' : 'Active';
        return statusFilter.includes(status);
      });
    }
    if (religionFilter.length > 0) roots = roots.filter(e => e.religion && religionFilter.includes(e.religion));
    if (stageFilter.length > 0) roots = roots.filter(e => e.stage && stageFilter.includes(e.stage));

    const subordinateEmails = new Set<string>();
    const allFilteredEmails = new Set<string>(roots.map(e => e.nisEmail?.toLowerCase()).filter(Boolean) as string[]);

    roots.forEach(emp => {
      emp.subordinates.forEach(sub => {
        if (allFilteredEmails.has(sub.nisEmail?.toLowerCase())) {
          subordinateEmails.add(sub.nisEmail.toLowerCase());
        }
      });
    });

    const finalRoots = roots
      .filter(e => e.nisEmail && !subordinateEmails.has(e.nisEmail.toLowerCase()))
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""));

    return finalRoots;
  }, [allEmployees, campusFilter, titleFilter, statusFilter, religionFilter, stageFilter]);

  const chartStats = useMemo(() => {
    const people = countPeople(rootEmployees);
    const campuses = new Set<string>();
    const walk = (nodes: Employee[]) => {
      nodes.forEach(node => {
        if (node.campus) campuses.add(node.campus);
        walk(node.subordinates);
      });
    };
    walk(rootEmployees);
    return {
      people,
      teams: rootEmployees.length,
      campuses: campuses.size,
    };
  }, [rootEmployees]);

  const search = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return { matchedIds: new Set<string>(), expandIds: new Set<string>() };
    return collectSearchMatches(rootEmployees, query);
  }, [rootEmployees, searchQuery]);

  const filterKey = [campusFilter.join(), titleFilter.join(), statusFilter.join(), religionFilter.join(), stageFilter.join()].join("|");
  const rootSignature = rootEmployees.map(root => root.id).join();

  useEffect(() => {
    setExpandedIds(getExpandIdsToDepth(rootEmployees, 1));
    // Reset expansion when the visible tree identity changes, not on every snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, rootSignature]);

  useEffect(() => {
    if (search.expandIds.size === 0) return;
    setExpandedIds(prev => {
      let changed = false;
      const next = new Set(prev);
      search.expandIds.forEach(id => {
        if (!next.has(id)) {
          next.add(id);
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [search.expandIds]);

  const zoomBy = useCallback((factor: number) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const rect = viewport.getBoundingClientRect();
    setView(prev => {
      const zoom = clampZoom(prev.zoom * factor);
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      const contentX = (cx - prev.x) / prev.zoom;
      const contentY = (cy - prev.y) / prev.zoom;
      return {
        zoom,
        x: cx - contentX * zoom,
        y: cy - contentY * zoom,
      };
    });
  }, []);

  const fitToScreen = useCallback(() => {
    const viewport = viewportRef.current;
    const content = contentRef.current;
    if (!viewport || !content) return;

    const padding = 48;
    const contentWidth = Math.max(content.offsetWidth, 1);
    const contentHeight = Math.max(content.offsetHeight, 1);
    const scaleX = (viewport.clientWidth - padding * 2) / contentWidth;
    const scaleY = (viewport.clientHeight - padding * 2) / contentHeight;
    const zoom = clampZoom(Math.min(scaleX, scaleY, 1));

    setView({
      zoom,
      x: (viewport.clientWidth - contentWidth * zoom) / 2,
      y: (viewport.clientHeight - contentHeight * zoom) / 2,
    });
  }, []);

  const hasChart = rootEmployees.length > 0;

  useEffect(() => {
    if (!hasChart) return;
    const frame = requestAnimationFrame(() => {
      requestAnimationFrame(() => fitToScreen());
    });
    return () => cancelAnimationFrame(frame);
  }, [filterKey, hasChart, fitToScreen]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || rootEmployees.length === 0) return;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = viewport.getBoundingClientRect();
      const cursorX = event.clientX - rect.left;
      const cursorY = event.clientY - rect.top;

      setView(prev => {
        const isTrackpadPan = !event.ctrlKey && !event.metaKey && Math.abs(event.deltaX) > 0;
        if (isTrackpadPan) {
          return {
            ...prev,
            x: prev.x - event.deltaX,
            y: prev.y - event.deltaY,
          };
        }

        const intensity = event.ctrlKey || event.metaKey ? 0.01 : 0.0025;
        const zoom = clampZoom(prev.zoom * Math.exp(-event.deltaY * intensity));
        const contentX = (cursorX - prev.x) / prev.zoom;
        const contentY = (cursorY - prev.y) / prev.zoom;
        return {
          zoom,
          x: cursorX - contentX * zoom,
          y: cursorY - contentY * zoom,
        };
      });
    };

    viewport.addEventListener('wheel', onWheel, { passive: false });
    return () => viewport.removeEventListener('wheel', onWheel);
  }, [rootEmployees.length]);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 && event.button !== 1) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    lastPointerRef.current = { x: event.clientX, y: event.clientY };
    dragDistanceRef.current = 0;
    setIsPanning(true);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isPanning) return;
    const dx = event.clientX - lastPointerRef.current.x;
    const dy = event.clientY - lastPointerRef.current.y;
    dragDistanceRef.current += Math.abs(dx) + Math.abs(dy);
    lastPointerRef.current = { x: event.clientX, y: event.clientY };
    setView(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
  };

  const stopPanning = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setIsPanning(false);
  };

  const handleZoomIn = () => zoomBy(1.15);
  const handleZoomOut = () => zoomBy(1 / 1.15);

  const handleEmployeeClick = useCallback((employee: Employee) => {
    if (dragDistanceRef.current > 8) return;
    router.push(`/employees/${employee.id}`);
  }, [router]);

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleExpandAll = () => setExpandedIds(collectExpandableIds(rootEmployees));
  const handleCollapseAll = () => setExpandedIds(new Set());

  const resetFilters = () => {
    setCampusFilter([]);
    setTitleFilter([]);
    setStatusFilter([]);
    setReligionFilter([]);
    setStageFilter([]);
    setSearchQuery("");
  };

  const handleExportPDF = async () => {
    if (!contentRef.current || rootEmployees.length === 0) {
      toast({
        variant: "destructive",
        title: "Nothing to Export",
        description: "Please select filters to generate a chart first.",
      });
      return;
    }

    setIsExporting(true);
    toast({ title: "Generating PDF...", description: "This may take a moment." });

    const originalTransform = contentRef.current.style.transform;
    contentRef.current.style.transform = 'none';

    try {
      const canvas = await html2canvas(contentRef.current, {
        scale: 2,
        allowTaint: true,
        useCORS: true,
        backgroundColor: "#F2F3F4",
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'px',
        format: [canvas.width, canvas.height],
      });

      pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
      pdf.save(`Org_Chart.pdf`);

    } catch (error) {
      console.error("Error generating PDF:", error);
      toast({
        variant: "destructive",
        title: "PDF Generation Failed",
        description: "An error occurred while creating the PDF.",
      });
    } finally {
      if (contentRef.current) {
        contentRef.current.style.transform = originalTransform;
      }
      setIsExporting(false);
    }
  };

  const chartUI = useMemo<ChartUIValue>(() => ({
    expandedIds,
    toggleExpand,
    searchQuery: searchQuery.trim().toLowerCase(),
    matchedIds: search.matchedIds,
    onEmployeeClick: handleEmployeeClick,
  }), [expandedIds, toggleExpand, searchQuery, search.matchedIds, handleEmployeeClick]);

  if (isLoading || isLoadingProfile) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Loading organization…</p>
      </div>
    );
  }

  if (!canViewPage) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <AlertTriangle className="h-12 w-12 text-destructive" />
        <h2 className="font-headline text-xl font-semibold">Access Denied</h2>
        <p className="text-muted-foreground">You do not have permission to view this page.</p>
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={250}>
      <div className="space-y-6">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="font-headline flex items-center gap-3 text-3xl font-bold tracking-tight md:text-4xl">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <GitBranch className="h-6 w-6" />
              </span>
              Organizational Chart
            </h1>
            <p className="mt-2 max-w-2xl text-muted-foreground">
              Read reporting lines from the top down. Color shows seniority, and each card opens that person’s profile.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatChip icon={Users} label="People in view" value={chartStats.people} />
            <StatChip icon={UserRound} label="Top-level teams" value={chartStats.teams} />
            <StatChip icon={Building2} label="Campuses" value={chartStats.campuses} />
          </div>
        </header>

        <Card className="overflow-hidden border-border/70 shadow-sm">
          <CardHeader className="space-y-4 pb-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <div className="relative min-w-[220px] flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Find a person, title, or campus…"
                  className="pl-9"
                  aria-label="Search the organization chart"
                />
              </div>
              {searchQuery && (
                <p className="text-xs text-muted-foreground lg:min-w-24">
                  {search.matchedIds.size} {search.matchedIds.size === 1 ? "match" : "matches"}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleExpandAll} disabled={!hasChart}>
                  <ChevronsDownUp className="h-4 w-4" />
                  Expand
                </Button>
                <Button variant="outline" size="sm" onClick={handleCollapseAll} disabled={!hasChart}>
                  <ChevronsUpDown className="h-4 w-4" />
                  Collapse
                </Button>
                <Button variant="outline" size="sm" onClick={resetFilters}>
                  <RotateCcw className="h-4 w-4" />
                  Reset
                </Button>
                <Button variant="default" size="sm" onClick={handleExportPDF} disabled={isExporting || !hasChart}>
                  {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
                  Export PDF
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-5">
              <MultiSelectFilter placeholder="Campus" options={campusList} selected={campusFilter} onChange={setCampusFilter} />
              <MultiSelectFilter placeholder="Title" options={titleList} selected={titleFilter} onChange={setTitleFilter} />
              <MultiSelectFilter
                placeholder="Status"
                options={[{ label: 'Active', value: 'Active' }, { label: 'Deactivated', value: 'Deactivated' }]}
                selected={statusFilter}
                onChange={setStatusFilter}
              />
              <MultiSelectFilter placeholder="Religion" options={religionList} selected={religionFilter} onChange={setReligionFilter} />
              <MultiSelectFilter placeholder="Stage" options={stageList} selected={stageFilter} onChange={setStageFilter} />
            </div>
          </CardHeader>

          <CardContent className="pt-0">
            {hasChart ? (
              <ChartUIContext.Provider value={chartUI}>
                <div
                  ref={viewportRef}
                  className={cn(
                    "relative h-[min(74vh,820px)] w-full select-none overflow-hidden rounded-xl border",
                    isPanning ? "cursor-grabbing" : "cursor-grab"
                  )}
                  style={{
                    touchAction: "none",
                    backgroundColor: "hsl(var(--background))",
                    backgroundImage: "radial-gradient(hsl(var(--primary) / 0.10) 1px, transparent 1px)",
                    backgroundSize: "18px 18px",
                  }}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={stopPanning}
                  onPointerCancel={stopPanning}
                  onDoubleClick={fitToScreen}
                  onDragStart={(event) => event.preventDefault()}
                >
                  <div className="pointer-events-none absolute left-3 top-3 z-10 flex flex-wrap gap-2">
                    {LEVEL_THEMES.slice(0, 4).map((theme) => (
                      <span
                        key={theme.name}
                        className="pointer-events-none inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold shadow-sm backdrop-blur-sm"
                        style={{
                          backgroundColor: theme.soft,
                          borderColor: `${theme.color}55`,
                          color: theme.color,
                        }}
                      >
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: theme.color }} />
                        {theme.name}
                      </span>
                    ))}
                  </div>

                  <div
                    ref={contentRef}
                    className="absolute left-0 top-0 w-max p-10 will-change-transform"
                    style={{
                      transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`,
                      transformOrigin: "0 0",
                    }}
                  >
                    <div className="flex flex-nowrap items-start">
                      {rootEmployees.map((root, index) => (
                        <EmployeeNode
                          key={root.id}
                          employee={root}
                          level={0}
                          isRoot
                          isFirst={index === 0}
                          isLast={index === rootEmployees.length - 1}
                          isOnly={rootEmployees.length === 1}
                        />
                      ))}
                    </div>
                  </div>

                  <div
                    className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-full border bg-card/95 px-2 py-1 shadow-lg backdrop-blur"
                    onPointerDown={(event) => event.stopPropagation()}
                  >
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleZoomOut} aria-label="Zoom out">
                      <ZoomOut className="h-4 w-4" />
                    </Button>
                    <span className="min-w-12 text-center text-xs tabular-nums text-muted-foreground">
                      {Math.round(view.zoom * 100)}%
                    </span>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleZoomIn} aria-label="Zoom in">
                      <ZoomIn className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={fitToScreen} aria-label="Fit to screen">
                      <Maximize2 className="h-4 w-4" />
                    </Button>
                    <span className="hidden px-2 text-[11px] text-muted-foreground sm:inline">
                      Drag to move · Scroll to zoom
                    </span>
                  </div>
                </div>
              </ChartUIContext.Provider>
            ) : (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed bg-muted/20 px-6 py-16 text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <GitBranch className="h-8 w-8" />
                </div>
                <h3 className="font-headline text-xl font-semibold">Select filters to generate the chart</h3>
                <p className="mt-2 max-w-md text-sm text-muted-foreground">
                  Choose at least one filter above, or pick a campus to see that team’s reporting line.
                </p>
                <div className="mt-5 flex flex-wrap justify-center gap-2">
                  {campusList.slice(0, 8).map((campus) => (
                    <Button
                      key={campus.value}
                      variant="outline"
                      size="sm"
                      onClick={() => setCampusFilter([campus.value])}
                    >
                      {campus.label}
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
}

export default function EmployeesChartPage() {
  return (
    <AppLayout>
      <EmployeesChartContent />
    </AppLayout>
  );
}
