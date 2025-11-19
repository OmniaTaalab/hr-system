
"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Label } from "recharts";

interface KpiDonutChartProps {
    data: { name: string; value: number; fill: string }[];
    totalPercentage: number;
}

export function KpiDonutChart({ data, totalPercentage }: KpiDonutChartProps) {
    return (
        <ResponsiveContainer width="100%" height={150}>
            <PieChart>
                <Pie
                    data={data}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={60}
                    paddingAngle={2}
                    dataKey="value"
                    stroke="none"
                >
                    {data.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                     <Label
                        value={`${totalPercentage.toFixed(0)}%`}
                        position="center"
                        fill="hsl(var(--foreground))"
                        className="text-2xl font-bold"
                    />
                </Pie>
            </PieChart>
        </ResponsiveContainer>
    );
}
