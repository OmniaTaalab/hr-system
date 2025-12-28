
"use client";

import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Calendar as CalendarIcon, ArrowRight } from "lucide-react";
import { useState } from "react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

function PersonalInfoSection() {
  const [dateOfBirth, setDateOfBirth] = useState<Date | undefined>();

  return (
    <div className="space-y-6">
      <h3 className="text-xl font-semibold border-b pb-2">Personal Info</h3>
      
      <div className="space-y-2">
        <Label>Name in English (As in official documents)</Label>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Input name="firstNameEn" placeholder="First Name *" required />
          <Input name="middleNameEn" placeholder="Middle Name" />
          <Input name="lastNameEn" placeholder="Last Name *" required />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Name in Arabic (As in I.D.)</Label>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Input name="firstNameAr" placeholder="* الاسم الأول" required dir="rtl" />
          <Input name="fatherNameAr" placeholder="اسم الأب" dir="rtl" />
          <Input name="familyNameAr" placeholder="* العائلة" required dir="rtl" />
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
            <Label>Date of Birth (as in official documents)</Label>
            <Popover>
                <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !dateOfBirth && "text-muted-foreground")}>
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {dateOfBirth ? format(dateOfBirth, "PPP") : <span>Pick a date</span>}
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                    <Calendar mode="single" selected={dateOfBirth} onSelect={setDateOfBirth} captionLayout="dropdown-buttons" fromYear={1950} toYear={new Date().getFullYear() - 18} initialFocus />
                </PopoverContent>
            </Popover>
        </div>
        <div className="space-y-2">
            <Label htmlFor="nationalities">Nationality(ies)</Label>
            <Input id="nationalities" name="nationalities" />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="placeOfBirth">Place of Birth (as in official documents)</Label>
        <Input id="placeOfBirth" name="placeOfBirth" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label>Social Title</Label>
          <RadioGroup name="socialTitle" className="flex items-center space-x-4 pt-2">
            <div className="flex items-center space-x-2"><RadioGroupItem value="Mr" id="title-mr" /><Label htmlFor="title-mr">Mr</Label></div>
            <div className="flex items-center space-x-2"><RadioGroupItem value="Miss" id="title-miss" /><Label htmlFor="title-miss">Miss</Label></div>
            <div className="flex items-center space-x-2"><RadioGroupItem value="Mrs" id="title-mrs" /><Label htmlFor="title-mrs">Mrs</Label></div>
          </RadioGroup>
        </div>
        <div className="space-y-2">
          <Label>Are you a parent at NIS?</Label>
          <RadioGroup name="isParentAtNIS" defaultValue="No" className="flex items-center space-x-4 pt-2">
            <div className="flex items-center space-x-2"><RadioGroupItem value="Yes" id="is-parent-yes" /><Label htmlFor="is-parent-yes">Yes</Label></div>
            <div className="flex items-center space-x-2"><RadioGroupItem value="No" id="is-parent-no" /><Label htmlFor="is-parent-no">No</Label></div>
          </RadioGroup>
        </div>
         <div className="space-y-2">
            <Label htmlFor="numberOfChildren">Number of children (if any)</Label>
            <Input id="numberOfChildren" name="numberOfChildren" type="number" min="0" defaultValue="0" />
        </div>
      </div>
      
       <div className="space-y-2">
          <Label>Marital Status</Label>
            <RadioGroup name="maritalStatus" className="flex flex-wrap gap-x-4 gap-y-2 pt-2">
                <div className="flex items-center space-x-2"><RadioGroupItem value="Single" id="status-single" /><Label htmlFor="status-single">Single</Label></div>
                <div className="flex items-center space-x-2"><RadioGroupItem value="Engaged" id="status-engaged" /><Label htmlFor="status-engaged">Engaged</Label></div>
                <div className="flex items-center space-x-2"><RadioGroupItem value="Married" id="status-married" /><Label htmlFor="status-married">Married</Label></div>
                <div className="flex items-center space-x-2"><RadioGroupItem value="Divorced" id="status-divorced" /><Label htmlFor="status-divorced">Divorced</Label></div>
                <div className="flex items-center space-x-2"><RadioGroupItem value="Separated" id="status-separated" /><Label htmlFor="status-separated">Separated</Label></div>
                <div className="flex items-center space-x-2"><RadioGroupItem value="Widowed" id="status-widowed" /><Label htmlFor="status-widowed">Widowed</Label></div>
          </RadioGroup>
        </div>

      <Separator />

      <h3 className="text-xl font-semibold border-b pb-2">Contact & Address</h3>
      <div className="space-y-2">
        <Label htmlFor="currentAddress">Current Address (Fill only if Available)</Label>
        <Input id="currentAddress" name="currentAddress" />
      </div>

       <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2"><Label htmlFor="country">Country</Label><Input id="country" name="country" /></div>
          <div className="space-y-2"><Label htmlFor="homePhone">Home Telephone Number</Label><Input id="homePhone" name="homePhone" type="tel"/></div>
          <div className="space-y-2"><Label htmlFor="area">Area</Label><Input id="area" name="area" /></div>
          <div className="space-y-2"><Label htmlFor="mobile">Mobile</Label><Input id="mobile" name="mobile" type="tel"/></div>
          <div className="space-y-2"><Label htmlFor="city">City</Label><Input id="city" name="city" /></div>
          <div className="space-y-2"><Label htmlFor="otherPhone">Other Telephone Numbers</Label><Input id="otherPhone" name="otherPhone" type="tel"/></div>
          <div className="space-y-2"><Label htmlFor="street">Street</Label><Input id="street" name="street" /></div>
          <div className="space-y-2"><Label htmlFor="email1">Email address (1)</Label><Input id="email1" name="email1" type="email"/></div>
          <div className="space-y-2"><Label htmlFor="buildingFloor">Building/Floor</Label><Input id="buildingFloor" name="buildingFloor" /></div>
          <div className="space-y-2"><Label htmlFor="email2">Email address (2)</Label><Input id="email2" name="email2" type="email"/></div>
          <div className="space-y-2"><Label htmlFor="apartmentNumber">Apartment Number</Label><Input id="apartmentNumber" name="apartmentNumber" /></div>
       </div>
    </div>
  );
}


export default function CreateApplicationPage() {
  return (
    <AppLayout>
      <div className="space-y-8 max-w-4xl mx-auto">
        <header>
          <h1 className="font-headline text-3xl font-bold tracking-tight md:text-4xl">
            Online Application
          </h1>
          <p className="text-muted-foreground">
            Please fill out the form below to apply.
          </p>
        </header>
        <Card className="shadow-lg">
            <CardHeader>
                <CardTitle>Application Form</CardTitle>
                <CardDescription>All fields marked with * are required.</CardDescription>
            </CardHeader>
            <CardContent>
                <form>
                    <PersonalInfoSection />
                    <div className="flex justify-end mt-8">
                        <Button type="submit">
                            Next
                            <ArrowRight className="ml-2 h-4 w-4" />
                        </Button>
                    </div>
                </form>
            </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
