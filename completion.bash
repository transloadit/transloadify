function _transloadify {
	local opts=(--verbose --quiet --json)
	local mode=""
	local action=""
	for word in "${COMP_WORDS[@]}"; do
		if [ -z "$mode" ]; then
			case "$word" in
				register)
					mode=register
					continue
					;;
				assemblies|assembly|a)
					mode=assemblies
					continue
					;;
				templates|template|t)
					mode=templates
					continue
					;;
				assembly-notifications|assembly-notification|notifications|notification|n)
					mode=assembly-notifications
					continue
					;;
				bills|bill|b)
					mode=bills
					continue
					;;
			esac
		fi
		if [ -z "$action" ]; then
			case "$word" in
				create|new|c)
					action=create
					continue
					;;
				delete|cancel|d)
					action=delete
					continue
					;;
				modify|edit|alter|m)
					action=modify
					continue
					;;
				replay|r)
					action=replay
					continue
					;;
				list|l)
					action=list
					continue
					;;
				get|info|view|display|g)
					action=get
					continue
					;;
			esac
		fi
	done
	if [ -z "$mode" ]; then
		opts+=(register assemblies templates assembly-notifications notifications bills)
	fi
	if [ -z "$action" ]; then
		case "$mode" in
			register)
				;;
			assemblies)
				opts+=(create new delete cancel replay list get info view display)
				;;
			templates)
				opts+=(create new delete modify edit alter list get info view display)
				;;
			assembly-notifications)
				opts+=(replay list)
				;;
			bills)
				opts+=(get info view display)
				;;
			"")
				opts+=(create new delete cancel modify edit alter replay list get info view display)
				;;
		esac
	fi
	if ([ -z "$action" ] && [ -z "$mode" ]) || ([ "$mode" == "assemblies" ] && [ "$action" == "create" ]); then
		opts+=(--steps --template --field --watch --recursive --input --output --delete-after-processing)
	fi
	case "$mode" in
		assemblies)
			case "$action" in
				list)
					opts+=(--before --after --keywords --fields)
					;;
				replay)
					opts+=(--field --steps --notify-url --reparse-template)
					;;
			esac
			;;
		templates)
			case "$action" in
				modify)
					opts+=(--name)
					;;
				list)
					opts+=(--before --after --sort --fields --order)
					;;
			esac
			;;
		assembly-notifications)
			case "$action" in
				replay)
					opts+=(--notify-url)
					;;
				list)
					opts+=(--failed --successful)
					;;
			esac
			;;
	esac

	COMPREPLY=( $(compgen -W "${opts[*]}" -- "${COMP_WORDS[COMP_CWORD]}") )
	return 0
}

complete -F _transloadify transloadify
