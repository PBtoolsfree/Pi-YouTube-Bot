import * as React from "react"
import { cn } from "@/lib/utils"

const Button = React.forwardRef(({ className, variant = "default", size = "default", asChild = false, ...props }, ref) => {
    return (
        <button
            className={cn(
                "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
                {
                    "bg-primary text-primary-foreground hover:bg-primary/90": variant === "default",
                    "bg-destructive text-destructive-foreground hover:bg-destructive/90": variant === "destructive",
                    "border border-input bg-background hover:bg-accent hover:text-accent-foreground": variant === "outline",
                    "bg-secondary text-secondary-foreground hover:bg-secondary/80": variant === "secondary",
                    "hover:bg-accent hover:text-accent-foreground": variant === "ghost",
                    "text-primary underline-offset-4 hover:underline": variant === "link",
                    "h-10 px-4 py-2": size === "default",
                    "h-9 rounded-md px-3": size === "sm",
                    "h-11 rounded-md px-8": size === "lg",
                    "h-10 w-10": size === "icon",
                },
                className
            )}
            ref={ref}
            {...props}
        />
    )
})
Button.displayName = "Button"

const Input = React.forwardRef(({ className, type, ...props }, ref) => {
    return (
        <input
            type={type}
            className={cn(
                "flex h-10 w-full rounded-md border border-zinc-800 bg-zinc-950/50 px-3 py-2 text-sm text-white ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
                className
            )}
            ref={ref}
            {...props}
        />
    )
})
Input.displayName = "Input"

const Card = React.forwardRef(({ className, ...props }, ref) => (
    <div
        ref={ref}
        className={cn("rounded-lg border border-zinc-800 bg-black/40 text-card-foreground shadow-sm", className)}
        {...props}
    />
))
Card.displayName = "Card"

const CardHeader = React.forwardRef(({ className, ...props }, ref) => (
    <div
        ref={ref}
        className={cn("flex flex-col space-y-1.5 p-6", className)}
        {...props}
    />
))
CardHeader.displayName = "CardHeader"

const CardTitle = React.forwardRef(({ className, ...props }, ref) => (
    <h3
        ref={ref}
        className={cn("text-2xl font-semibold leading-none tracking-tight text-white", className)}
        {...props}
    />
))
CardTitle.displayName = "CardTitle"

const CardContent = React.forwardRef(({ className, ...props }, ref) => (
    <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
))
CardContent.displayName = "CardContent"

const CardDescription = React.forwardRef(({ className, ...props }, ref) => (
    <p
        ref={ref}
        className={cn("text-sm text-zinc-400", className)}
        {...props}
    />
))
CardDescription.displayName = "CardDescription"

const Switch = React.forwardRef(({ className, checked, onCheckedChange, ...props }, ref) => (
    <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onCheckedChange && onCheckedChange(!checked)}
        className={cn(
            "peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            checked ? "bg-primary" : "bg-input",
            className
        )}
        ref={ref}
        {...props}
    >
        <span
            data-state={checked ? "checked" : "unchecked"}
            className={cn(
                "pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform",
                checked ? "translate-x-5" : "translate-x-0"
            )}
        />
    </button>
))
Switch.displayName = "Switch"

const Badge = React.forwardRef(({ className, variant = "default", ...props }, ref) => {
    return (
        <div ref={ref} className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2", {
            "border-transparent bg-primary text-primary-foreground hover:bg-primary/80": variant === "default",
            "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80": variant === "secondary",
            "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80": variant === "destructive",
            "text-foreground": variant === "outline"
        }, className)} {...props} />
    )
})
Badge.displayName = "Badge"

const Textarea = React.forwardRef(({ className, ...props }, ref) => {
    return (
        <textarea
            className={cn(
                "flex min-h-[80px] w-full rounded-md border border-zinc-800 bg-zinc-950/50 px-3 py-2 text-sm text-white ring-offset-background placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
                className
            )}
            ref={ref}
            {...props}
        />
    )
})
Textarea.displayName = "Textarea"

const Label = React.forwardRef(({ className, ...props }, ref) => (
    <label
        ref={ref}
        className={cn(
            "text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 text-zinc-100",
            className
        )}
        {...props}
    />
))
Label.displayName = "Label"

const Checkbox = React.forwardRef(({ className, checked, onCheckedChange, ...props }, ref) => (
    <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        onClick={() => onCheckedChange && onCheckedChange(!checked)}
        className={cn(
            "peer h-4 w-4 shrink-0 rounded-sm border border-emerald-500/50 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
            checked ? "bg-emerald-500 text-black border-emerald-500" : "border-emerald-500/30 bg-background/50",
            className
        )}
        data-state={checked ? "checked" : "unchecked"}
        ref={ref}
        {...props}
    >
        <span className={cn("flex items-center justify-center text-current", checked ? "opacity-100" : "opacity-0")}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
        </span>
    </button>
))
Checkbox.displayName = "Checkbox"

export { Button, Input, Card, CardHeader, CardTitle, CardContent, CardDescription, Switch, Badge, Textarea, Label, Checkbox }
