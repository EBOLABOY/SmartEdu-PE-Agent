export type PromptSkill = {
  id: string;
  description: string;
  render: () => string;
};

export type PromptSkillWithInput<Input> = {
  id: string;
  description: string;
  render: (input: Input) => string;
};
