:local mons "janfebmaraprmayjunjulaugsepoctnovdec"
:local d [/system clock get date]
:local today 0
:if ([:typeof [:find $d "-"]] = "num") do={
  :set today [:tonum ([:pick $d 0 4] . [:pick $d 5 7] . [:pick $d 8 10])]
} else={
  :local mi ([:find $mons [:pick $d 0 3]] / 3 + 1)
  :local mm [:tostr $mi]
  :if ($mi < 10) do={ :set mm ("0" . $mm) }
  :set today [:tonum ([:pick $d 7 11] . $mm . [:pick $d 4 6])]
}
:local kick [:toarray ""]
:if ($today > 20200101) do={
  :foreach s in=[/ppp secret find] do={
    :local n [/ppp secret get $s name]
    :local c [/ppp secret get $s comment]
    :local l [:len $c]
    :local stage 0
        :local dd ($dz->$n)
        :if ([:typeof $dd] = "num") do={
            :if ($today >= $dd) do={
                :local ip ($ix->$n)
                :if ([:typeof $ip] = "str") do={
                    :set stage 1
                    :if (([:len [/ppp profile find where name=$ip]] > 0) && ([/ppp secret get $s profile] != $ip)) do={
                        /ppp secret set $s profile=$ip
                        :set kick ($kick, $n)
                    }
                } else={
                    :if ([/ppp secret get $s disabled] = false) do={
                        /ppp secret disable $s
                        :set kick ($kick, $n)
                    }
                }
            }
        }
    :local exp 0
    :local cut 0
    :if ($l >= 13) do={
      :local t [:pick $c ($l - 10) $l]
      :if ([:pick $c ($l - 13) ($l - 10)] = " - ") do={
        :if (([:pick $t 4 5] = "-") && ([:pick $t 7 8] = "-")) do={
          :set exp [:tonum ([:pick $t 0 4] . [:pick $t 5 7] . [:pick $t 8 10])]
          :set cut ($l - 13)
        }
        :if (([:pick $t 2 3] = "/") && ([:pick $t 5 6] = "/")) do={
          :set exp [:tonum ([:pick $t 6 10] . [:pick $t 3 5] . [:pick $t 0 2])]
          :set cut ($l - 13)
        }
      }
    }
    :if (($cut = 0) && ($l >= 14)) do={
      :local t [:pick $c ($l - 11) $l]
      :if (([:pick $c ($l - 14) ($l - 11)] = " - ") && ([:pick $t 3 4] = "/") && ([:pick $t 6 7] = "/")) do={
        :local mi [:find $mons [:pick $t 0 3]]
        :if ([:typeof $mi] = "num") do={
          :set mi ($mi / 3 + 1)
          :local mm [:tostr $mi]
          :if ($mi < 10) do={ :set mm ("0" . $mm) }
          :set exp [:tonum ([:pick $t 7 11] . $mm . [:pick $t 4 6])]
          :set cut ($l - 14)
        }
      }
    }
    :if ([:typeof $exp] != "num") do={ :set exp 0 }
    :if (($exp > 0) && ($today > $exp)) do={
      :local f ($fx->$n)
      :if ([:typeof $f] != "str") do={ :set f $fupDef }
      :if ([:len [/ppp profile find where name=$f]] > 0) do={
        :if (($stage = 0) && ([/ppp secret get $s profile] != $f)) do={
                        /ppp secret set $s profile=$f
          :set kick ($kick, $n)
        }
        /ppp secret set $s comment=([:pick $c 0 $cut] . " - expired")
      } else={
        :log warning ("bilingku: profil isolir " . $f . " tidak ada, " . $n . " tidak dipindahkan")
      }
    }
  }
}
:if ([:len $kick] > 0) do={
  :delay 5m
  :foreach n in=$kick do={ /ppp active remove [find where name=$n] }
}