"use client";

import React, { useActionState, useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Edit, Layers, Loader2, PlusCircle, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/lib/i18n";
import { useUserProfile } from "@/components/layout/app-layout";
import { useLeaveTypes } from "@/hooks/use-leave-types";
import { useSharedLeaveGroups } from "@/hooks/use-shared-leave-groups";
import {
  manageSharedLeaveGroupAction,
  type ManageSharedGroupState,
} from "@/app/actions/settings-actions";
import { RoleAllowancesEditor } from "./role-allowances-editor";
import type {
  LeaveUnit,
  ResetPeriod,
  RoleAllowanceOverride,
  SharedLeaveGroup,
} from "@/types/leave-policy";
import { Skeleton } from "../ui/skeleton";

const initialGroupState: ManageSharedGroupState = {
  success: false,
  message: null,
  errors: {},
};

export function SharedLeaveGroupsManager() {
  const { isRTL } = useI18n();
  const { toast } = useToast();
  const { profile } = useUserProfile();
  const { leaveTypes, isLoading: isLoadingTypes } = useLeaveTypes();
  const { sharedGroups, isLoading: isLoadingGroups } = useSharedLeaveGroups();

  const t = (en: string, ar: string) => (isRTL ? ar : en);

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<SharedLeaveGroup | null>(null);
  const [deletingGroup, setDeletingGroup] = useState<SharedLeaveGroup | null>(null);

  // Add/Edit form states
  const [groupName, setGroupName] = useState("");
  const [allowanceAmount, setAllowanceAmount] = useState("4");
  const [unit, setUnit] = useState<LeaveUnit>("hours");
  const [resetPeriod, setResetPeriod] = useState<ResetPeriod>("monthly");
  const [selectedLeaveTypeIds, setSelectedLeaveTypeIds] = useState<string[]>([]);
  const [roleAllowances, setRoleAllowances] = useState<RoleAllowanceOverride[]>([]);

  const [addState, addAction, isAddPending] = useActionState(
    manageSharedLeaveGroupAction,
    initialGroupState
  );
  const [editState, editAction, isEditPending] = useActionState(
    manageSharedLeaveGroupAction,
    initialGroupState
  );
  const [deleteState, deleteAction, isDeletePending] = useActionState(
    manageSharedLeaveGroupAction,
    initialGroupState
  );

  const resetForm = () => {
    setGroupName("");
    setAllowanceAmount("4");
    setUnit("hours");
    setResetPeriod("monthly");
    setSelectedLeaveTypeIds([]);
    setRoleAllowances([]);
  };

  const openAddModal = () => {
    resetForm();
    setIsAddOpen(true);
  };

  const openEditModal = (group: SharedLeaveGroup) => {
    setEditingGroup(group);
    setGroupName(group.name);
    setAllowanceAmount(String(group.allowanceAmount));
    setUnit(group.unit);
    setResetPeriod(group.resetPeriod);
    setSelectedLeaveTypeIds(group.leaveTypeIds || []);
    setRoleAllowances(group.roleAllowances || []);
  };

  const toggleLeaveType = (id: string) => {
    setSelectedLeaveTypeIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  useEffect(() => {
    if (addState?.message) {
      toast({
        title: addState.success ? t("Success", "تم بنجاح") : t("Error", "خطأ"),
        description: addState.message,
        variant: addState.success ? "default" : "destructive",
      });
      if (addState.success) {
        setIsAddOpen(false);
        resetForm();
      }
    }
  }, [addState, toast]);

  useEffect(() => {
    if (editState?.message) {
      toast({
        title: editState.success ? t("Success", "تم بنجاح") : t("Error", "خطأ"),
        description: editState.message,
        variant: editState.success ? "default" : "destructive",
      });
      if (editState.success) {
        setEditingGroup(null);
      }
    }
  }, [editState, toast]);

  useEffect(() => {
    if (deleteState?.message) {
      toast({
        title: deleteState.success ? t("Success", "تم بنجاح") : t("Error", "خطأ"),
        description: deleteState.message,
        variant: deleteState.success ? "default" : "destructive",
      });
      if (deleteState.success) {
        setDeletingGroup(null);
      }
    }
  }, [deleteState, toast]);

  const formatPeriod = (p: ResetPeriod) => {
    if (p === "monthly") return t("Monthly", "شهري");
    if (p === "academic_term") return t("Per Academic Term", "لكل فصل دراسي");
    return t("Yearly", "سنوي");
  };

  const renderFormFields = (serverErrors?: ManageSharedGroupState["errors"]) => (
    <div className="space-y-4 py-2 max-h-[68vh] overflow-y-auto px-1">
      <input type="hidden" name="actorId" value={profile?.id || ""} />
      <input
        type="hidden"
        name="actorEmail"
        value={profile?.nisEmail || profile?.email || ""}
      />
      <input type="hidden" name="actorRole" value={profile?.role || ""} />
      <input
        type="hidden"
        name="leaveTypeIdsJson"
        value={JSON.stringify(selectedLeaveTypeIds)}
      />
      <input
        type="hidden"
        name="roleAllowancesJson"
        value={JSON.stringify(roleAllowances)}
      />

      <div className="space-y-1.5">
        <Label htmlFor="shared-group-name">
          {t("Group Name", "اسم المجموعة المشتركة")} *
        </Label>
        <Input
          id="shared-group-name"
          name="name"
          value={groupName}
          onChange={(e) => setGroupName(e.target.value)}
          placeholder={t(
            "e.g. Early Dismissal + Late Arrival",
            "مثال: إذن تأخير + انصراف مبكر"
          )}
          required
        />
        {serverErrors?.name && (
          <p className="text-xs text-destructive">{serverErrors.name.join(", ")}</p>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="shared-allowance-amount">
            {t("Shared Allowance", "الرصيد المشترك")} *
          </Label>
          <Input
            id="shared-allowance-amount"
            name="allowanceAmount"
            type="number"
            step="any"
            min="0.1"
            value={allowanceAmount}
            onChange={(e) => setAllowanceAmount(e.target.value)}
            required
          />
          {serverErrors?.allowanceAmount && (
            <p className="text-xs text-destructive">
              {serverErrors.allowanceAmount.join(", ")}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label>{t("Unit", "الوحدة")}</Label>
          <Select
            name="unit"
            value={unit}
            onValueChange={(v) => setUnit(v as LeaveUnit)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="hours">{t("Hours", "ساعات")}</SelectItem>
              <SelectItem value="days">{t("Days", "أيام")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>{t("Reset Period", "دورة التجديد")}</Label>
          <Select
            name="resetPeriod"
            value={resetPeriod}
            onValueChange={(v) => setResetPeriod(v as ResetPeriod)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="monthly">{t("Monthly", "شهري")}</SelectItem>
              <SelectItem value="academic_term">
                {t("Per Academic Term", "لكل فصل دراسي")}
              </SelectItem>
              <SelectItem value="yearly">{t("Yearly", "سنوي")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label>
          {t(
            "Linked Leave Types (consume same shared balance)",
            "أنواع الإجازات المرتبطة (تستهلك من نفس الرصيد المشترك)"
          )}{" "}
          *
        </Label>
        {isLoadingTypes ? (
          <Skeleton className="h-20 w-full" />
        ) : leaveTypes.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {t(
              "No Leave Types found yet. Please add Leave Types above first.",
              "لا توجد أنواع إجازات بعد. يرجى إضافة أنواع الإجازات أعلاه أولاً."
            )}
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto rounded-md border p-3 bg-background">
            {leaveTypes.map((lt) => {
              const checked = selectedLeaveTypeIds.includes(lt.id);
              return (
                <label
                  key={lt.id}
                  className="flex items-center gap-2 text-sm cursor-pointer rounded px-1.5 py-1 hover:bg-muted/50"
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => toggleLeaveType(lt.id)}
                  />
                  <span className="truncate">{lt.name}</span>
                </label>
              );
            })}
          </div>
        )}
        {serverErrors?.leaveTypeIds && (
          <p className="text-xs text-destructive">
            {serverErrors.leaveTypeIds.join(", ")}
          </p>
        )}
      </div>

      <RoleAllowancesEditor
        overrides={roleAllowances}
        onChange={setRoleAllowances}
        unit={unit}
      />

      {serverErrors?.form && (
        <p className="text-sm text-destructive">{serverErrors.form.join(", ")}</p>
      )}
    </div>
  );

  return (
    <Card className="w-full min-w-0" dir={isRTL ? "rtl" : "ltr"}>
      <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className={isRTL ? "text-right" : "text-left"}>
          <CardTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary" />
            {t(
              "Shared Leave Balance Groups",
              "مجموعات أرصدة الإجازات المشتركة"
            )}
          </CardTitle>
          <CardDescription className="mt-1">
            {t(
              "Link multiple leave types (e.g., Early Dismissal + Late Arrival) to share one combined balance and configure role or employee exceptions.",
              "ربط أكثر من نوع إجازة (مثل: الانصراف المبكر + التأخير) برصيد مشترك واحد مع إمكانية تحديد استثناءات للأدوار أو الموظفين."
            )}
          </CardDescription>
        </div>

        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline" onClick={openAddModal}>
              <PlusCircle className="h-4 w-4 me-2" />
              {t("Add Shared Group", "إضافة مجموعة مشتركة")}
            </Button>
          </DialogTrigger>
          <DialogContent
            className="max-w-xl"
            dir={isRTL ? "rtl" : "ltr"}
          >
            <form action={addAction}>
              <input type="hidden" name="operation" value="add" />
              <DialogHeader>
                <DialogTitle>
                  {t("Create Shared Leave Group", "إنشاء مجموعة رصيد مشترك")}
                </DialogTitle>
                <DialogDescription>
                  {t(
                    "All linked leave types will draw from this combined balance.",
                    "ستستهلك جميع أنواع الإجازات المرتبطة من هذا الرصيد المشترك."
                  )}
                </DialogDescription>
              </DialogHeader>

              {renderFormFields(addState?.errors)}

              <DialogFooter className="mt-3">
                <DialogClose asChild>
                  <Button type="button" variant="outline">
                    {t("Cancel", "إلغاء")}
                  </Button>
                </DialogClose>
                <Button type="submit" disabled={isAddPending}>
                  {isAddPending && (
                    <Loader2 className="h-4 w-4 me-2 animate-spin" />
                  )}
                  {t("Create Group", "إنشاء المجموعة")}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </CardHeader>

      <CardContent>
        {isLoadingGroups ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : sharedGroups.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-6 border rounded-md bg-muted/20">
            {t(
              "No shared leave balance groups configured yet.",
              "لم يتم إعداد أي مجموعات رصيد مشترك حتى الآن."
            )}
          </p>
        ) : (
          <div className="border rounded-md overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("Group Name", "اسم المجموعة")}</TableHead>
                  <TableHead>{t("Allowance", "الرصيد")}</TableHead>
                  <TableHead>{t("Linked Leave Types", "الأنواع المرتبطة")}</TableHead>
                  <TableHead>{t("Overrides", "الاستثناءات")}</TableHead>
                  <TableHead className={isRTL ? "text-left" : "text-right"}>
                    {t("Actions", "الإجراءات")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sharedGroups.map((group) => {
                  const linkedNames =
                    group.leaveTypeNames && group.leaveTypeNames.length > 0
                      ? group.leaveTypeNames
                      : leaveTypes
                          .filter((lt) =>
                            (group.leaveTypeIds || []).includes(lt.id) ||
                            lt.sharedGroupId === group.id
                          )
                          .map((lt) => lt.name);

                  return (
                    <TableRow key={group.id}>
                      <TableCell className="font-medium">{group.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-medium">
                          {group.allowanceAmount}{" "}
                          {group.unit === "hours"
                            ? t("Hours", "ساعة")
                            : t("Days", "يوم")}{" "}
                          • {formatPeriod(group.resetPeriod)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {linkedNames.map((n) => (
                            <Badge key={n} variant="secondary" className="text-xs">
                              {n}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        {group.roleAllowances && group.roleAllowances.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {group.roleAllowances.map((ov, idx) => (
                              <Badge
                                key={idx}
                                variant="outline"
                                className="text-[11px] bg-primary/5 border-primary/20"
                              >
                                {ov.targetLabel || ov.targetValue}:{" "}
                                {ov.allowanceAmount}
                                {group.unit === "hours" ? "h" : "d"}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className={isRTL ? "text-left" : "text-right"}>
                        <Dialog
                          open={editingGroup?.id === group.id}
                          onOpenChange={(open) => {
                            if (!open) setEditingGroup(null);
                          }}
                        >
                          <DialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEditModal(group)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent
                            className="max-w-xl"
                            dir={isRTL ? "rtl" : "ltr"}
                          >
                            <form action={editAction}>
                              <input type="hidden" name="operation" value="update" />
                              <input type="hidden" name="id" value={group.id} />
                              <DialogHeader>
                                <DialogTitle>
                                  {t("Edit Shared Leave Group", "تعديل المجموعة المشتركة")}
                                </DialogTitle>
                                <DialogDescription>
                                  {t(
                                    "Changes update employee balances automatically without deleting historical requests.",
                                    "يتم تحديث الأرصدة تلقائيًا دون حذف الطلبات التاريخية."
                                  )}
                                </DialogDescription>
                              </DialogHeader>

                              {renderFormFields(editState?.errors)}

                              <DialogFooter className="mt-3">
                                <DialogClose asChild>
                                  <Button type="button" variant="outline">
                                    {t("Cancel", "إلغاء")}
                                  </Button>
                                </DialogClose>
                                <Button type="submit" disabled={isEditPending}>
                                  {isEditPending && (
                                    <Loader2 className="h-4 w-4 me-2 animate-spin" />
                                  )}
                                  {t("Save Changes", "حفظ التغييرات")}
                                </Button>
                              </DialogFooter>
                            </form>
                          </DialogContent>
                        </Dialog>

                        <AlertDialog
                          open={deletingGroup?.id === group.id}
                          onOpenChange={(open) => {
                            if (!open) setDeletingGroup(null);
                          }}
                        >
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-destructive hover:text-destructive"
                              onClick={() => setDeletingGroup(group)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent dir={isRTL ? "rtl" : "ltr"}>
                            <form action={deleteAction}>
                              <input type="hidden" name="operation" value="delete" />
                              <input type="hidden" name="id" value={group.id} />
                              <input type="hidden" name="actorId" value={profile?.id || ""} />
                              <input
                                type="hidden"
                                name="actorEmail"
                                value={profile?.nisEmail || profile?.email || ""}
                              />
                              <input
                                type="hidden"
                                name="actorRole"
                                value={profile?.role || ""}
                              />
                              <AlertDialogHeader>
                                <AlertDialogTitle>
                                  {t("Delete Shared Group?", "حذف المجموعة المشتركة؟")}
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                  {t(
                                    `This will delete the shared group "${group.name}". Linked leave types and historical requests will be preserved.`,
                                    `سيتم حذف المجموعة المشتركة "${group.name}". لن يتم حذف أنواع الإجازات أو السجلات السابقة.`
                                  )}
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel type="button">
                                  {t("Cancel", "إلغاء")}
                                </AlertDialogCancel>
                                <AlertDialogAction
                                  type="submit"
                                  disabled={isDeletePending}
                                  className="bg-destructive hover:bg-destructive/90"
                                >
                                  {isDeletePending ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    t("Delete", "حذف")
                                  )}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </form>
                          </AlertDialogContent>
                        </AlertDialog>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
