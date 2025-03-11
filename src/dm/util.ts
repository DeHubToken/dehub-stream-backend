import { AccountModel } from 'models/Account';
import { DmModel } from 'models/message/DM';
import { DmSettingModel } from 'models/message/message.setting';

export const isAllowChat = async (address: string, arr: string[]) => {
  if (!address) return false; // Ensure address is provided

  const userSetting = await DmSettingModel.findOne({ address: address.toLowerCase() });

  return !userSetting?.disables.some((status: string) => arr.includes(status));
};

export const getUsersBlockingAllChats = async (dm: string): Promise<any[]> => {
  if (!dm) return []; // Ensure DM ID is provided

  const currentDm = await DmModel.findById(dm);
  if (!currentDm) return []; // DM does not exist
  const participants = await AccountModel.find({
    _id: { $in: currentDm.participants.map(participant => participant.participant.toString()) },
  }).select('address username displayName ');

  const participantAddresses = participants.map(({ address }) => address.toLowerCase());
  // Fetch DM settings for those addresses
  const dmSettings = await DmSettingModel.find({ address: { $in: participantAddresses }, disables: { $in: ['ALL'] } });
  // Find users who have disabled all chats
  const users = dmSettings
    .map(setting => participants.find(({ address }) => setting.address === address))
    .filter(user => user);
  return users.length>0?users:null;
};
