use strict; use warnings;
# The page refused the button to whoever opened the report, which on a
# shared sheet is often the manager who is meant to sign it. The server
# already answers this question properly, so the page stops guessing.
my $p = "app/report/[id]/page.tsx";
open(my $fh, "<", $p) or die "$p: $!";
binmode $fh; local $/; my $s = <$fh>; close $fh;
my $crlf = ($s =~ /\r\n/) ? 1 : 0;
$s =~ s/\r\n/\n/g;
my $a = "    if (sub.created_by === profile.email && !isDirector(profile.role)) return false;\n";
if ($s !~ /\Q$a\E/) { print "already done\n"; exit 0; }
($s =~ s/\Q$a\E//) or do { print "could not place it\n"; exit 1 };
$s =~ s/\n/\r\n/g if $crlf;
open(my $out, ">", $p) or die $!; binmode $out; print $out $s; close $out;
print "ok\n";
