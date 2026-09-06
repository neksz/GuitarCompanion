import { StylesConfig, GroupBase } from 'react-select'

export interface DarkSelectStyleOptions {
  compact?: boolean
  minWidth?: number | string
  maxWidth?: number | string
  accentColor?: string
}

export function getDarkSelectStyles<
  Option,
  IsMulti extends boolean = false,
  Group extends GroupBase<Option> = GroupBase<Option>
>(options?: DarkSelectStyleOptions): StylesConfig<Option, IsMulti, Group> {
  const compact = options?.compact ?? false
  const accent = options?.accentColor ?? '#bb86fc'

  return {
    control: (base, state) => ({
      ...base,
      backgroundColor: '#22222c',
      borderColor: state.isFocused ? accent : 'rgba(255, 255, 255, 0.12)',
      boxShadow: state.isFocused ? `0 0 0 1px ${accent}` : 'none',
      borderRadius: compact ? 8 : 6,
      minHeight: compact ? 34 : 40,
      fontSize: compact ? 12 : 14,
      cursor: 'pointer',
      minWidth: options?.minWidth,
      maxWidth: options?.maxWidth,
      transition: 'all 0.15s ease',
      '&:hover': {
        borderColor: state.isFocused ? accent : 'rgba(255, 255, 255, 0.25)'
      }
    }),
    valueContainer: (base) => ({
      ...base,
      padding: compact ? '2px 8px' : '4px 10px',
      gap: 4
    }),
    input: (base) => ({
      ...base,
      color: '#fff',
      margin: 0,
      padding: 0
    }),
    placeholder: (base) => ({
      ...base,
      color: '#777',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis'
    }),
    singleValue: (base) => ({
      ...base,
      color: '#fff',
      fontWeight: 500
    }),
    multiValue: (base) => ({
      ...base,
      backgroundColor: 'rgba(187, 134, 252, 0.15)',
      borderRadius: 4,
      border: '1px solid rgba(187, 134, 252, 0.3)'
    }),
    multiValueLabel: (base) => ({
      ...base,
      color: '#bb86fc',
      fontSize: 11,
      fontWeight: 500,
      padding: '1px 5px'
    }),
    multiValueRemove: (base) => ({
      ...base,
      color: '#bb86fc',
      cursor: 'pointer',
      padding: '0 3px',
      '&:hover': {
        backgroundColor: 'rgba(187, 134, 252, 0.3)',
        color: '#fff'
      }
    }),
    menu: (base) => ({
      ...base,
      backgroundColor: '#22222c',
      border: '1px solid #3b3b48',
      borderRadius: 8,
      boxShadow: '0 8px 24px rgba(0, 0, 0, 0.6), 0 2px 6px rgba(0, 0, 0, 0.4)',
      overflow: 'hidden',
      zIndex: 9999,
      marginTop: 4
    }),
    menuPortal: (base) => ({
      ...base,
      zIndex: 99999
    }),
    menuList: (base) => ({
      ...base,
      padding: 4,
      maxHeight: 240,
      scrollbarWidth: 'thin',
      scrollbarColor: '#444 transparent'
    }),
    option: (base, state) => ({
      ...base,
      backgroundColor: state.isSelected
        ? 'rgba(187, 134, 252, 0.2)'
        : state.isFocused
          ? 'rgba(255, 255, 255, 0.08)'
          : 'transparent',
      color: state.isSelected ? accent : '#ddd',
      fontSize: compact ? 12 : 13,
      padding: compact ? '6px 10px' : '8px 12px',
      borderRadius: 5,
      cursor: 'pointer',
      transition: 'background-color 0.12s ease',
      display: 'flex',
      alignItems: 'center',
      '&:active': {
        backgroundColor: 'rgba(187, 134, 252, 0.3)'
      }
    }),
    dropdownIndicator: (base) => ({
      ...base,
      padding: compact ? 4 : 8,
      color: '#777',
      '&:hover': {
        color: '#bbb'
      }
    }),
    clearIndicator: (base) => ({
      ...base,
      padding: compact ? 4 : 8,
      color: '#777',
      cursor: 'pointer',
      '&:hover': {
        color: '#ff6b6b'
      }
    }),
    indicatorSeparator: () => ({
      display: 'none'
    }),
    noOptionsMessage: (base) => ({
      ...base,
      color: '#777',
      fontSize: 12
    })
  }
}
