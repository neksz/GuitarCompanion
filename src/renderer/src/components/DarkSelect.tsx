import React from 'react'
import Select, { GroupBase, Props as SelectProps } from 'react-select'
import CreatableSelect, { CreatableProps } from 'react-select/creatable'

export function DarkMultiSelect<Option, Group extends GroupBase<Option> = GroupBase<Option>>(
  props: SelectProps<Option, true, Group>
): React.JSX.Element {
  return <Select {...props} isMulti />
}

export function DarkSingleSelect<Option, Group extends GroupBase<Option> = GroupBase<Option>>(
  props: SelectProps<Option, false, Group>
): React.JSX.Element {
  return <Select {...props} isMulti={false} />
}

export { Select as DarkSelect, CreatableSelect as DarkCreatableSelect }
export type { SelectProps, CreatableProps }
