export const schema = {
  type: "object",
  properties: {
    name: {
      type: "string",
      minLength: 1,
    },
    done: {
      type: "boolean",
    },
    due_date: {
      type: "string",
      format: "date",
    },
    recurrence: {
      type: "string",
      enum: ["Never", "Daily", "Weekly", "Monthly"],
    },
  },
  required: ["name", "due_date"],
};
