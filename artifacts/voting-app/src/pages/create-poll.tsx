import { useState } from "react";
import { useLocation } from "wouter";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Trash2, Loader2, ArrowLeft } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useCreatePoll, getListPollsQueryKey } from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";

const formSchema = z.object({
  question: z.string().min(3, "Question must be at least 3 characters").max(120, "Question is too long"),
  options: z.array(
    z.object({
      value: z.string().min(1, "Option cannot be empty").max(60, "Option is too long")
    })
  ).min(2, "At least 2 options are required").max(10, "Maximum 10 options allowed")
});

type FormValues = z.infer<typeof formSchema>;

export default function CreatePoll() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createPoll = useCreatePoll();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      question: "",
      options: [{ value: "" }, { value: "" }]
    }
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "options"
  });

  const onSubmit = (data: FormValues) => {
    createPoll.mutate(
      { 
        data: { 
          question: data.question, 
          options: data.options.map(o => o.value) 
        } 
      },
      {
        onSuccess: (newPoll) => {
          queryClient.invalidateQueries({ queryKey: getListPollsQueryKey() });
          toast({
            title: "Poll created",
            description: "Your poll is now live.",
          });
          setLocation(`/polls/${newPoll.id}`);
        },
        onError: () => {
          toast({
            title: "Error",
            description: "Failed to create poll. Please try again.",
            variant: "destructive"
          });
        }
      }
    );
  };

  return (
    <Layout>
      <div className="max-w-2xl mx-auto space-y-6">
        <Link href="/" className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back to polls
        </Link>
        
        <Card className="border-border shadow-md">
          <CardHeader>
            <CardTitle className="text-2xl">Create a New Poll</CardTitle>
            <CardDescription>Ask a question and provide up to 10 options for people to vote on.</CardDescription>
          </CardHeader>
          
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)}>
              <CardContent className="space-y-6">
                <FormField
                  control={form.control}
                  name="question"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-base">Question</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="What's your favorite programming language?" 
                          className="text-lg py-6"
                          data-testid="input-question"
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="space-y-4">
                  <p className="text-base font-medium leading-none">Options</p>
                  {fields.map((field, index) => (
                    <FormField
                      key={field.id}
                      control={form.control}
                      name={`options.${index}.value`}
                      render={({ field: inputField }) => (
                        <FormItem>
                          <div className="flex items-center gap-2">
                            <div className="bg-muted w-8 h-10 rounded-md flex items-center justify-center font-mono text-sm text-muted-foreground shrink-0 border border-border">
                              {index + 1}
                            </div>
                            <FormControl>
                              <Input 
                                placeholder={`Option ${index + 1}`} 
                                data-testid={`input-option-${index}`}
                                {...inputField} 
                              />
                            </FormControl>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                              onClick={() => remove(index)}
                              disabled={fields.length <= 2}
                              data-testid={`button-remove-option-${index}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  ))}
                  
                  {fields.length < 10 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full border-dashed"
                      onClick={() => append({ value: "" })}
                      data-testid="button-add-option"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Add Option
                    </Button>
                  )}
                </div>
              </CardContent>
              <CardFooter className="bg-muted/30 pt-6 flex justify-end gap-3">
                <Button 
                  type="button" 
                  variant="ghost" 
                  onClick={() => setLocation("/")}
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  disabled={createPoll.isPending}
                  className="font-semibold px-8"
                  data-testid="button-submit-poll"
                >
                  {createPoll.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    "Create Poll"
                  )}
                </Button>
              </CardFooter>
            </form>
          </Form>
        </Card>
      </div>
    </Layout>
  );
}
