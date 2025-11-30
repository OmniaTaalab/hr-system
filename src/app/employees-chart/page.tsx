
"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { AppLayout, useUserProfile } from "@/components/layout/app-layout";
import { db } from '@/lib/firebase/config';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, AlertTriangle, Users, BarChartBig, ArrowDown, Filter, GitBranch, ZoomIn, ZoomOut, FileDown } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useRouter } from 'next/navigation';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
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

function EmployeeCard({ employee }: { employee: Employee }) {
  return (
    <Card className="w-48 text-center shadow-md hover:shadow-lg transition-shadow shrink-0 bg-card">
      <CardContent className="flex flex-col items-center pt-6">
        <Avatar className="h-20 w-20 mb-2">
          <AvatarImage src={employee.photoURL} alt={employee.name} />
          <AvatarFallback>{getInitials(employee.name)}</AvatarFallback>
        </Avatar>
        <p className="w-full break-words text-sm leading-tight font-semibold">{employee.name}</p>
        <p className="w-full break-words text-[10px] leading-tight text-muted-foreground">{employee.title || employee.role}</p>
      </CardContent>
    </Card>
  );
}

// Recursive component to render the employee tree
function EmployeeNode({ employee }: { employee: Employee }) {
  return (
    <div className="flex flex-col items-center gap-4">
      <EmployeeCard employee={employee} />
      {employee.subordinates && employee.subordinates.length > 0 && (
        <>
          <ArrowDown className="h-6 w-6 text-muted-foreground shrink-0" />
          <div className="flex flex-row flex-wrap justify-center gap-8 pl-8 border-l-2 border-muted">
            {employee.subordinates.map(subordinate => (
              <EmployeeNode key={subordinate.id} employee={subordinate} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// Minimap Node for the minimap
function MinimapNode({ employee }: { employee: Employee }) {
    return (
        <div className="flex flex-col items-center">
            <div className="w-2 h-2 bg-primary rounded-full"></div>
            {employee.subordinates && employee.subordinates.length > 0 && (
                <>
                    <div className="w-px h-2 bg-muted-foreground"></div>
                    <div className="flex flex-row gap-2 pl-2 border-l border-muted-foreground">
                        {employee.subordinates.map(subordinate => (
                            <MinimapNode key={subordinate.id} employee={subordinate} />
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}

// Minimap component
function Minimap({ contentRef, viewportRef, roots, zoom }: { contentRef: React.RefObject<HTMLDivElement>, viewportRef: React.RefObject<HTMLDivElement>, roots: Employee[], zoom: number }) {
    const minimapRef = useRef<HTMLDivElement>(null);
    const minimapViewportRef = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState(false);

    const moveViewport = useCallback((e: MouseEvent) => {
        const minimap = minimapRef.current;
        const viewport = viewportRef.current;
        const content = contentRef.current;

        if (!minimap || !viewport || !content || !isDragging) return;
        
        const rect = minimap.getBoundingClientRect();
        const scaleX = minimap.offsetWidth / (content.scrollWidth * zoom);

        const x = e.clientX - rect.left;
        
        viewport.scrollLeft = (x / scaleX) - (viewport.offsetWidth / 2);
    }, [contentRef, viewportRef, zoom, isDragging]);


    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
        moveViewport(e.nativeEvent);
    }, [moveViewport]);

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (isDragging) {
              moveViewport(e);
            }
        };
        const handleMouseUp = () => {
            setIsDragging(false);
        };

        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging, moveViewport]);

    useEffect(() => {
        const viewport = viewportRef.current;
        const content = contentRef.current;
        const minimap = minimapRef.current;
        const minimapViewport = minimapViewportRef.current;

        if (!viewport || !content || !minimap || !minimapViewport) return;

        const updateMinimap = () => {
            const contentWidth = content.scrollWidth * zoom;
            const contentHeight = content.scrollHeight * zoom;
            const viewportWidth = viewport.offsetWidth;
            const viewportHeight = viewport.offsetHeight;

            if (contentWidth <= viewportWidth && contentHeight <= viewportHeight) {
                minimap.style.display = 'none';
                return;
            }
            minimap.style.display = 'block';

            const minimapWidth = minimap.offsetWidth;
            const scale = minimapWidth / contentWidth;
            const minimapHeight = contentHeight * scale;
            minimap.style.height = `${minimapHeight}px`;
            
            minimapViewport.style.width = `${viewportWidth * scale}px`;
            minimapViewport.style.height = `${viewportHeight * scale}px`;

            const onScroll = () => {
                const scrollTop = viewport.scrollTop;
                const scrollLeft = viewport.scrollLeft;
                minimapViewport.style.top = `${scrollTop * scale}px`;
                minimapViewport.style.left = `${scrollLeft * scale}px`;
            };

            viewport.addEventListener('scroll', onScroll, { passive: true });
            onScroll();
            return () => viewport.removeEventListener('scroll', onScroll);
        };

        const resizeObserver = new ResizeObserver(updateMinimap);
        resizeObserver.observe(content);
        resizeObserver.observe(viewport);
        updateMinimap();

        return () => resizeObserver.disconnect();
    }, [roots, contentRef, viewportRef, zoom]);

    return (
        <div 
            ref={minimapRef} 
            className="fixed bottom-4 right-4 bg-card/70 border border-border backdrop-blur-sm rounded-lg shadow-lg w-64 z-50 cursor-pointer"
            onMouseDown={handleMouseDown}
        >
            <div className="absolute top-0 left-0 p-2 scale-[0.08] origin-top-left pointer-events-none">
                <div className="flex space-x-8">
                {roots.map(root => (
                    <MinimapNode key={root.id} employee={root} />
                ))}
                </div>
            </div>
            <div ref={minimapViewportRef} className="absolute bg-primary/30 border border-primary rounded" style={{ pointerEvents: 'none' }}></div>
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
  
  const [zoom, setZoom] = useState(1);
  const [isExporting, setIsExporting] = useState(false);

  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const canViewPage = !isLoadingProfile && profile && (profile.role?.toLowerCase() === 'admin' || profile.role?.toLowerCase() === 'hr');

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
    const campusSet = new Set<string>();
    const titleSet = new Set<string>();
    const religionSet = new Set<string>();
    const stageSet = new Set<string>();

    allEmployees.forEach(e => {
        if(e.campus) campusSet.add(e.campus);
        if(e.title) titleSet.add(e.title);
        if(e.religion) religionSet.add(e.religion);
        if(e.stage) stageSet.add(e.stage);
    });

    const toOptions = (set: Set<string>) => Array.from(set).sort().map(v => ({ label: v, value: v }));

    return {
        campusList: toOptions(campusSet),
        titleList: toOptions(titleSet),
        religionList: toOptions(religionSet),
        stageList: toOptions(stageSet)
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
  
  const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.1, 2));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.1, 0.2));

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
  
    const originalScale = contentRef.current.style.transform;
    contentRef.current.style.transform = 'scale(1)';
  
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
        contentRef.current.style.transform = originalScale;
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
            <div className="flex items-center gap-2 pt-4">
                <Button variant="outline" size="icon" onClick={handleZoomOut}><ZoomOut className="h-4 w-4"/></Button>
                <Button variant="outline" size="icon" onClick={handleZoomIn}><ZoomIn className="h-4 w-4"/></Button>
                <Button variant="outline" onClick={handleExportPDF} disabled={isExporting}>
                    {isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <FileDown className="mr-2 h-4 w-4"/>}
                    Export PDF
                </Button>
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
            <div className="relative">
              <ScrollArea className="w-full whitespace-nowrap bg-background" viewportRef={viewportRef}>
                <div 
                    className="p-4 w-max origin-top-left" 
                    ref={contentRef}
                    style={{ transform: `scale(${zoom})` }}
                >
                    <div className="flex space-x-8">
                    {rootEmployees.map(root => (
                        <EmployeeNode key={root.id} employee={root} />
                    ))}
                    </div>
                </div>
                <ScrollBar orientation="horizontal" />
              </ScrollArea>
              <Minimap contentRef={contentRef} viewportRef={viewportRef} roots={rootEmployees} zoom={zoom} />
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
