import React from "react";
import { Button } from "./Button";

export default { title: "Atoms/Button", component: Button };

export const Primary = () => <Button>Primary</Button>;
export const Ghost = () => <Button variant="ghost">Ghost</Button>;
export const Danger = () => <Button variant="danger">Danger</Button>;

