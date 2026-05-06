import type { AiThought } from '../types';

interface SmartTextProps {
  text: string;
  selectedProfile: string;
  selectedRegion: string;
  availableNodes: string[];
  onOpenInspect: (assetId: string, profile: string, region: string) => void;
  onOpenNode: (node: string) => void;
}

const AWS_PATTERN_STR = '\\b(?:sg-[a-zA-Z0-9-]+|vpc-[a-zA-Z0-9-]+|subnet-[a-zA-Z0-9-]+|eni-[a-zA-Z0-9-]+|tgw-rtb-[a-zA-Z0-9-]+|lgw-rtb-[a-zA-Z0-9-]+|tgw-[a-zA-Z0-9-]+|rtb-[a-zA-Z0-9-]+|acl-[a-zA-Z0-9-]+|(?:-lists\\s+)?pl-[a-zA-Z0-9-]+|dxgw-[a-zA-Z0-9-]+|dxcon-[a-zA-Z0-9-]+|vif-[a-zA-Z0-9-]+|i-[a-zA-Z0-9-]+|igw-[a-zA-Z0-9-]+|vgw-[a-zA-Z0-9-]+|cgw-[a-zA-Z0-9-]+|tgw-attach-[a-zA-Z0-9-]+|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\\b';
const AWS_CHECK_REGEX = new RegExp(`^${AWS_PATTERN_STR}$`, 'i');

export function SmartText({ text, selectedProfile, selectedRegion, availableNodes, onOpenInspect, onOpenNode }: SmartTextProps) {
  if (!text) return null;

  const profileMatch = text.match(/profile:\s*([a-zA-Z0-9._-]+)/i);
  const regionMatch = text.match(/region:\s*([a-z0-9-]+)/i);
  const contextProfile = profileMatch ? profileMatch[1] : selectedProfile;
  const contextRegion = regionMatch ? regionMatch[1] : selectedRegion;

  const escapedNodes = [...availableNodes]
    .sort((a, b) => b.length - a.length)
    .map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

  const nodePatternStr = escapedNodes.length > 0
    ? `|(?:(?<=\\s|^|['\"\\[\\]{}\\(\\)])(?:${escapedNodes.join('|')})(?=\\s|$|['\"\\[\\]{}\\(\\)]))`
    : '';

  const combinedRegex = new RegExp(`(${AWS_PATTERN_STR}${nodePatternStr})`, 'gi');
  const parts = text.split(combinedRegex);

  if (parts.length === 1) return <>{text}</>;

  return (
    <>
      {parts.map((part, i) => {
        if (!part) return null;
        const isAwsId = AWS_CHECK_REGEX.test(part);
        const isNode = availableNodes.includes(part);

        if (isAwsId || isNode) {
          return (
            <span
              key={i}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (isAwsId) {
                  onOpenInspect(part.trim(), contextProfile, contextRegion);
                } else {
                  onOpenNode(part.trim());
                }
              }}
              className={isAwsId
                ? 'text-[#88c0d0] hover:text-[#8fbcbb] cursor-pointer underline decoration-[#88c0d0]/40 underline-offset-2 font-bold transition-all px-0.5 rounded hover:bg-[#88c0d0]/10 inline'
                : 'text-[#ebcb8b] hover:text-[#eceff4] cursor-pointer underline decoration-[#ebcb8b]/40 underline-offset-2 font-bold italic transition-all px-0.5 rounded hover:bg-[#ebcb8b]/10 inline'}
              title={isAwsId ? `Inspect in ${contextProfile} (${contextRegion})` : `Open Terminal for ${part.trim()}`}
            >
              {part}
            </span>
          );
        }
        return part;
      })}
    </>
  );
}

// Re-exported type for convenience
export type { AiThought };
