import React from "react";
import { ScrollViewProps } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

type Props = ScrollViewProps & {
  keyboardVerticalOffset?: number;
};

export function KeyboardAwareScrollViewCompat({
  children,
  keyboardShouldPersistTaps = "handled",
  keyboardVerticalOffset = 0,
  ...props
}: Props) {
  return (
    <KeyboardAwareScrollView
      bottomOffset={Math.max(16, keyboardVerticalOffset)}
      extraKeyboardSpace={12}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      {...props}
    >
      {children}
    </KeyboardAwareScrollView>
  );
}
