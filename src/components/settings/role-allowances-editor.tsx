"use client";

import React, { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2 } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import type {
  LeaveUnit,
  OverrideTargetType,
  RoleAllowanceOverride,
} from "@/types/leave-policy";

interface OptionItem {
  value: string;
  label: string;
}

interface RoleAllowancesEditorProps {
  overrides: RoleAllowanceOverride[];
  onChange: (next: RoleAllowanceOverride[]) => void;
  unit: LeaveUnit;
}

export function RoleAllowancesEditor({
  overrides,
  onChange,
  unit,
}: RoleAllowancesEditorProps) {
  const { isRTL } = useI18n();
  const t = (en: string, ar: string) => (isRTL ? ar : en);

  const [positionClasses, setPositionClasses] = useState<OptionItem[]>([]);
  const [roles, setRoles] = useState<OptionItem[]>([]);
  const [employees, setEmployees] = useState<OptionItem[]>([]);

  const [targetType, setTargetType] =
    useState<OverrideTargetType>("positionClass");
  const [targetValue, setTargetValue] = useState("");
  const [allowanceAmount, setAllowanceAmount] = useState("");

  useEffect(() => {
    let mounted = true;
    Promise.all([
      getDocs(collection(db, "positionClasses")),
      getDocs(collection(db, "roles")),
      getDocs(collection(db, "employee")),
    ])
      .then(([posSnap, rolesSnap, empSnap]) => {
        if (!mounted) return;
        const posList = posSnap.docs
          .map((d) => String(d.data().name || "").trim())
          .filter(Boolean)
          .sort((a, b) => a.localeCompare(b))
          .map((name) => ({ value: name, label: name }));
        setPositionClasses(posList);

        const roleList = rolesSnap.docs
          .map((d) => String(d.data().name || "").trim())
          .filter(Boolean)
          .sort((a, b) => a.localeCompare(b))
          .map((name) => ({ value: name, label: name }));
        setRoles(roleList);

        const empList = empSnap.docs
          .map((d) => {
            const data = d.data();
            const empName = String(data.name || "Unknown").trim();
            const empId = data.employeeId ? String(data.employeeId).trim() : d.id;
            return {
              value: d.id,
              label: `${empName} (${empId})`,
            };
          })
          .sort((a, b) => a.label.localeCompare(b.label));
        setEmployees(empList);
      })
      .catch((err) => {
        console.warn("Could not load override target options:", err);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const availableOptions =
    targetType === "positionClass"
      ? positionClasses
      : targetType === "role"
      ? roles
      : employees;

  const handleAdd = () => {
    const trimmedVal = targetValue.trim();
    const numericAmount = Number(allowanceAmount);
    if (!trimmedVal || isNaN(numericAmount) || numericAmount < 0) return;

    const matchedOpt = availableOptions.find((o) => o.value === trimmedVal);
    const rounded = Math.round(numericAmount * 100) / 100;

    const nextEntry: RoleAllowanceOverride = {
      targetType,
      targetValue: trimmedVal,
      targetLabel: matchedOpt?.label || trimmedVal,
      allowanceAmount: rounded,
    };

    const filtered = overrides.filter(
      (item) =>
        !(
          item.targetType === targetType &&
          item.targetValue.trim().toLowerCase() === trimmedVal.toLowerCase()
        )
    );
    onChange([...filtered, nextEntry]);
    setTargetValue("");
    setAllowanceAmount("");
  };

  const handleRemove = (index: number) => {
    onChange(overrides.filter((_, idx) => idx !== index));
  };

  const targetTypeLabel = (type: OverrideTargetType) => {
    if (type === "positionClass") return t("Position Class", "تصنيف الوظيفة");
    if (type === "role") return t("Role", "الدور الوظيفي");
    return t("Employee", "موظف");
  };

  const unitLabel =
    unit === "hours" ? t("hrs", "س") : t("days", "يوم");

  return (
    <div className="space-y-3 rounded-lg border border-border/80 bg-muted/20 p-3">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs font-semibold">
          {t(
            "Role / Position Class / Employee Overrides (Optional)",
            "استثناءات الرصيد حسب الوظيفة / التصنيف / الموظف (اختياري)"
          )}
        </Label>
      </div>

      {overrides.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {overrides.map((ov, idx) => (
            <Badge
              key={`${ov.targetType}-${ov.targetValue}-${idx}`}
              variant="secondary"
              className="flex items-center gap-1.5 py-1 px-2 text-xs font-normal"
            >
              <span className="font-semibold text-primary">
                {targetTypeLabel(ov.targetType)}:
              </span>
              <span>{ov.targetLabel || ov.targetValue}</span>
              <span className="font-semibold">
                → {ov.allowanceAmount} {unitLabel}
              </span>
              <button
                type="button"
                onClick={() => handleRemove(idx)}
                className="ml-1 text-muted-foreground hover:text-destructive"
                aria-label="Remove override"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
        <div className="sm:col-span-4 space-y-1">
          <Label className="text-[11px] text-muted-foreground">
            {t("Applies To", "ينطبق على")}
          </Label>
          <Select
            value={targetType}
            onValueChange={(val) => {
              setTargetType(val as OverrideTargetType);
              setTargetValue("");
            }}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="positionClass">
                {t("Position Class", "تصنيف الوظيفة")}
              </SelectItem>
              <SelectItem value="role">{t("Role", "الدور الوظيفي")}</SelectItem>
              <SelectItem value="employee">{t("Employee", "موظف")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="sm:col-span-4 space-y-1">
          <Label className="text-[11px] text-muted-foreground">
            {targetTypeLabel(targetType)}
          </Label>
          {availableOptions.length > 0 ? (
            <Select value={targetValue} onValueChange={setTargetValue}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue
                  placeholder={t("Select...", "اختر...")}
                />
              </SelectTrigger>
              <SelectContent>
                {availableOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              className="h-8 text-xs"
              value={targetValue}
              onChange={(e) => setTargetValue(e.target.value)}
              placeholder={t("e.g. Editor", "مثال: Editor")}
            />
          )}
        </div>

        <div className="sm:col-span-3 space-y-1">
          <Label className="text-[11px] text-muted-foreground">
            {t(`Amount (${unitLabel})`, `الرصيد (${unitLabel})`)}
          </Label>
          <Input
            type="number"
            step="any"
            min="0"
            className="h-8 text-xs"
            value={allowanceAmount}
            onChange={(e) => setAllowanceAmount(e.target.value)}
            placeholder="8"
          />
        </div>

        <div className="sm:col-span-1 flex justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 w-full sm:w-8 p-0"
            onClick={handleAdd}
            disabled={!targetValue.trim() || allowanceAmount === ""}
            title={t("Add override", "إضافة استثناء")}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
