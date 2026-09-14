
"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { AppLayout, useUserProfile } from "@/components/layout/app-layout";
import { db } from '@/lib/firebase/config';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, AlertTriangle, ArrowDown, Filter, GitBranch, ZoomIn, ZoomOut, FileDown, Maximize2 } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useToast } from "@/hooks/use-toast";
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { MultiSelectFilter } from '@/components/multi-select';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

// Enhanced Employee interface to support the tree structure
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

function EmployeeCard({ employee }: { employee: Employee }) {
  const displayName = getChartDisplayName(employee.name, 3);
  const jobTitle = employee.title || employee.role || "";

  return (
    <Card className="w-48 shrink-0 overflow-hidden bg-card text-center shadow-md transition-shadow hover:shadow-lg">
      <CardContent className="flex h-[11.5rem] flex-col items-center px-3 pb-4 pt-5">
        <Avatar className="mb-2 h-16 w-16 shrink-0">
          <AvatarImage src={employee.photoURL} alt={employee.name} />
          <AvatarFallback>{getInitials(employee.name)}</AvatarFallback>
        </Avatar>
        <p className="w-full whitespace-normal text-sm font-semibold leading-tight line-clamp-2">
          {displayName}
        </p>
        <p className="mt-1 w-full whitespace-normal text-[10px] leading-tight text-muted-foreground line-clamp-2">
          {jobTitle}
        </p>
      </CardContent>
    </Card>
  );
}

// Recursive component to render the employee tree
function EmployeeNode({ employee }: { employee: Employee }) {
  const hasSubordinates = employee.subordinates && employee.subordinates.length > 0;

  return (
    <div className="flex flex-col items-center gap-4">
      <EmployeeCard employee={employee} />
      {hasSubordinates && (
        <>
          <ArrowDown className="h-6 w-6 shrink-0 text-muted-foreground" />
          <div className="flex flex-row flex-nowrap justify-center gap-8">
            {employee.subordinates.map(subordinate => (
              <EmployeeNode key={subordinate.id} employee={subordinate} />
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
  
  const [view, setView] = useState({ zoom: 1, x: 40, y: 40 });
  const [isPanning, setIsPanning] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const lastPointerRef = useRef({ x: 0, y: 0 });

  const canViewPage = !isLoadingProfile && profile && (['admin', 'hr', 'director'].includes(profile.role?.toLowerCase() || ''));

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
        stageList: toOptions(stageMap)
    }
  }, [allEmployees]);
  
  const rootEmployees = useMemo(() => {
    const noFiltersApplied = campusFilter.length === 0 && titleFilter.length === 0 && statusFilter.length === 0 && religionFilter.length === 0 && stageFilter.length === 0;

    if (!allEmployees.length || noFiltersApplied) {
        return [];
    }
  
    const emailMap = new Map<string, Employee>();
    allEmployees.forEach(emp => {
      emp.subordinates = [];
      if (emp.nisEmail) {
        emailMap.set(emp.nisEmail.toLowerCase(), emp);
      }
    });
  
    allEmployees.forEach(employee => {
      if (employee.reportLine1) {
        const manager = emailMap.get(employee.reportLine1.toLowerCase());
        if (manager) {
          manager.subordinates.push(employee);
        }
      }
    });

    let roots = allEmployees;

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
    const allFilteredEmails = new Set<string>(roots.map(e => e.nisEmail?.toLowerCase()).filter(Boolean));

    roots.forEach(emp => {
        emp.subordinates.forEach(sub => {
            if(allFilteredEmails.has(sub.nisEmail?.toLowerCase())) {
                 subordinateEmails.add(sub.nisEmail.toLowerCase());
            }
        });
    });

    const finalRoots = roots.filter(e => e.nisEmail && !subordinateEmails.has(e.nisEmail.toLowerCase()));
    
    return finalRoots;
  
  }, [allEmployees, campusFilter, titleFilter, statusFilter, religionFilter, stageFilter]);
  
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
    const frame = requestAnimationFrame(() => fitToScreen());
    return () => cancelAnimationFrame(frame);
  }, [campusFilter, titleFilter, statusFilter, religionFilter, stageFilter, hasChart, fitToScreen]);

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
    setIsPanning(true);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isPanning) return;
    const dx = event.clientX - lastPointerRef.current.x;
    const dy = event.clientY - lastPointerRef.current.y;
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
        backgroundColor: null,
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


  if (isLoading || isLoadingProfile) {
    return (
      <div className="flex justify-center items-center h-full">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  if (!canViewPage) {
    return (
      <div className="flex justify-center items-center h-full flex-col gap-4">
        <AlertTriangle className="h-12 w-12 text-destructive" />
        <h2 className="text-xl font-semibold">Access Denied</h2>
        <p className="text-muted-foreground">You do not have permission to view this page.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-headline text-3xl font-bold tracking-tight md:text-4xl flex items-center">
          <GitBranch className="mr-3 h-8 w-8 text-primary" />
          Organizational Chart
        </h1>
        <p className="text-muted-foreground">
          Visual representation of the company's reporting structure.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Reporting Hierarchy</CardTitle>
          <CardDescription>
            This chart is generated based on the "Report Line 1" field for each employee. Use filters to view specific structures.
          </CardDescription>
            <div className="flex flex-wrap items-center gap-2 pt-4">
                <Button variant="outline" size="icon" onClick={handleZoomOut} aria-label="Zoom out">
                  <ZoomOut className="h-4 w-4"/>
                </Button>
                <span className="min-w-12 text-center text-sm tabular-nums text-muted-foreground">
                  {Math.round(view.zoom * 100)}%
                </span>
                <Button variant="outline" size="icon" onClick={handleZoomIn} aria-label="Zoom in">
                  <ZoomIn className="h-4 w-4"/>
                </Button>
                <Button variant="outline" size="icon" onClick={fitToScreen} aria-label="Fit to screen">
                  <Maximize2 className="h-4 w-4"/>
                </Button>
                <Button variant="outline" onClick={handleExportPDF} disabled={isExporting}>
                    {isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <FileDown className="mr-2 h-4 w-4"/>}
                    Export PDF
                </Button>
                <p className="w-full text-xs text-muted-foreground sm:w-auto sm:ml-2">
                  Drag to move · Scroll to zoom
                </p>
            </div>
           <Accordion type="single" collapsible className="w-full pt-2">
                <AccordionItem value="filters">
                    <AccordionTrigger>
                        <div className="flex items-center gap-2 text-sm">
                            <Filter className="h-4 w-4" />
                            Advanced Filters
                        </div>
                    </AccordionTrigger>
                    <AccordionContent className="pt-4">
                        <div className="flex flex-wrap items-center gap-2">
                            <MultiSelectFilter placeholder="Filter by campus..." options={campusList} selected={campusFilter} onChange={setCampusFilter} className="w-full sm:w-auto flex-1 min-w-[150px]" />
                            <MultiSelectFilter placeholder="Filter by title..." options={titleList} selected={titleFilter} onChange={setTitleFilter} className="w-full sm:w-auto flex-1 min-w-[150px]" />
                            <MultiSelectFilter placeholder="Filter by status..." options={[{label: 'Active', value: 'Active'}, {label: 'Deactivated', value: 'Deactivated'}]} selected={statusFilter} onChange={setStatusFilter} className="w-full sm:w-auto flex-1 min-w-[150px]" />
                            <MultiSelectFilter placeholder="Filter by religion..." options={religionList} selected={religionFilter} onChange={setReligionFilter} className="w-full sm:w-auto flex-1 min-w-[150px]" />
                            <MultiSelectFilter placeholder="Filter by stage..." options={stageList} selected={stageFilter} onChange={setStageFilter} className="w-full sm:w-auto flex-1 min-w-[150px]" />
                        </div>
                    </AccordionContent>
                </AccordionItem>
            </Accordion>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center items-center h-40">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
            </div>
          ) : rootEmployees.length > 0 ? (
            <div
              ref={viewportRef}
              className={`relative h-[min(70vh,720px)] w-full select-none overflow-hidden rounded-md border bg-muted/30 ${isPanning ? 'cursor-grabbing' : 'cursor-grab'}`}
              style={{ touchAction: 'none' }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={stopPanning}
              onPointerCancel={stopPanning}
              onDoubleClick={fitToScreen}
              onDragStart={(event) => event.preventDefault()}
            >
              <div
                ref={contentRef}
                className="absolute left-0 top-0 w-max p-8 will-change-transform"
                style={{
                  transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`,
                  transformOrigin: '0 0',
                }}
              >
                <div className="flex space-x-8">
                  {rootEmployees.map(root => (
                    <EmployeeNode key={root.id} employee={root} />
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center text-muted-foreground py-10 border-2 border-dashed rounded-lg">
              <h3 className="text-xl font-semibold">Select Filters to Generate Chart</h3>
              <p className="mt-2">
                Please select at least one filter (e.g., Campus, Title) to display the organizational structure.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function EmployeesChartPage() {
  return (
    <AppLayout>
      <EmployeesChartContent />
    </AppLayout>
  );
}
